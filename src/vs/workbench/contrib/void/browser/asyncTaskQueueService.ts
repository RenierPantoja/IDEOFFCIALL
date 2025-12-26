/*--------------------------------------------------------------------------------------
 *  Copyright 2025 RK IDE. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { AsyncTask, TaskStateChangeEvent } from '../common/asyncTaskTypes.js';
import { IAIActionLogService } from './aiActionLogService.js';

export interface IAsyncTaskQueueService {
	readonly _serviceBrand: undefined;

	readonly onDidAddTask: Event<AsyncTask>;
	readonly onDidUpdateTask: Event<AsyncTask>;
	readonly onDidTaskStateChange: Event<TaskStateChangeEvent>;

	queueTask(
		title: string,
		description: string,
		type: string,
		payload: any,
		priority?: AsyncTask['priority']
	): Promise<AsyncTask>;

	cancelTask(taskId: string): Promise<void>;
	getTask(taskId: string): AsyncTask | undefined;
	getTasks(): AsyncTask[];
	getPendingTasks(): AsyncTask[];

	processNextTask(processor: (task: AsyncTask) => Promise<any>): Promise<void>;
}

export const IAsyncTaskQueueService = createDecorator<IAsyncTaskQueueService>('AsyncTaskQueueService');

const STORAGE_KEY = 'void.asyncTasks';

export class AsyncTaskQueueService extends Disposable implements IAsyncTaskQueueService {
	readonly _serviceBrand: undefined;

	private _tasks: Map<string, AsyncTask> = new Map();
	private _isProcessing = false;

	private readonly _onDidAddTask = this._register(new Emitter<AsyncTask>());
	readonly onDidAddTask: Event<AsyncTask> = this._onDidAddTask.event;

	private readonly _onDidUpdateTask = this._register(new Emitter<AsyncTask>());
	readonly onDidUpdateTask: Event<AsyncTask> = this._onDidUpdateTask.event;

	private readonly _onDidTaskStateChange = this._register(new Emitter<TaskStateChangeEvent>());
	readonly onDidTaskStateChange: Event<TaskStateChangeEvent> = this._onDidTaskStateChange.event;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IAIActionLogService private readonly aiActionLogService: IAIActionLogService
	) {
		super();
		this._loadTasks();
		this._log('AsyncTaskQueueService initialized');
	}

	async queueTask(
		title: string,
		description: string,
		type: string,
		payload: any,
		priority: AsyncTask['priority'] = 'medium'
	): Promise<AsyncTask> {
		const task: AsyncTask = {
			id: generateUuid(),
			title,
			description,
			status: 'pending',
			priority,
			createdAt: new Date().toISOString(),
			progress: 0,
			type,
			payload
		};

		this._tasks.set(task.id, task);
		this._saveTasks();

		this._onDidAddTask.fire(task);
		this.aiActionLogService.logAction('create', 'System', 'Task Queued', 'baixo', `Task "${title}" queued for execution`);

		return task;
	}

	async cancelTask(taskId: string): Promise<void> {
		const task = this._tasks.get(taskId);
		if (task && (task.status === 'pending' || task.status === 'processing')) {
			const oldStatus = task.status;
			task.status = 'cancelled';
			task.completedAt = new Date().toISOString();

			this._saveTasks();
			this._updateTask(task, oldStatus);

			this.aiActionLogService.logAction('update', 'System', 'Task Cancelled', 'baixo', `Task "${task.title}" was cancelled`);
		}
	}

	getTask(taskId: string): AsyncTask | undefined {
		return this._tasks.get(taskId);
	}

	getTasks(): AsyncTask[] {
		return Array.from(this._tasks.values()).sort((a, b) => {
			return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
		});
	}

	getPendingTasks(): AsyncTask[] {
		return Array.from(this._tasks.values())
			.filter(t => t.status === 'pending')
			.sort((a, b) => {
				// High priority first, then oldest first
				const priorityMap = { high: 3, medium: 2, low: 1 };
				const pDiff = priorityMap[b.priority] - priorityMap[a.priority];
				if (pDiff !== 0) return pDiff;
				return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
			});
	}

	async processNextTask(processor: (task: AsyncTask) => Promise<any>): Promise<void> {
		if (this._isProcessing) return;

		const pendingTasks = this.getPendingTasks();
		if (pendingTasks.length === 0) return;

		const task = pendingTasks[0];
		this._isProcessing = true;

		try {
			// Update status to processing
			const oldStatus = task.status;
			task.status = 'processing';
			task.startedAt = new Date().toISOString();
			this._saveTasks();
			this._updateTask(task, oldStatus);

			this.aiActionLogService.logAction('read', 'System', 'Processing Task', 'baixo', `Starting execution of "${task.title}"`);

			// Execute task
			const result = await processor(task);

			// Update status to completed
			const completedStatus = task.status;
			task.status = 'completed';
			task.completedAt = new Date().toISOString();
			task.progress = 100;
			task.result = result;

			this._saveTasks();
			this._updateTask(task, completedStatus);

			this.aiActionLogService.logAction('create', 'System', 'Task Completed', 'médio', `Task "${task.title}" finished successfully`);

		} catch (error) {
			// Update status to failed
			const failedStatus = task.status;
			task.status = 'failed';
			task.completedAt = new Date().toISOString();
			task.error = error instanceof Error ? error.message : String(error);

			this._saveTasks();
			this._updateTask(task, failedStatus);

			this.aiActionLogService.logAction('update', 'System', 'Task Failed', 'alto', `Task "${task.title}" failed: ${task.error}`);
		} finally {
			this._isProcessing = false;

			// Try to process next task immediately
			if (this.getPendingTasks().length > 0) {
				setTimeout(() => this.processNextTask(processor), 100);
			}
		}
	}

	private _updateTask(task: AsyncTask, oldStatus: AsyncTask['status']) {
		this._onDidUpdateTask.fire(task);
		if (oldStatus !== task.status) {
			this._onDidTaskStateChange.fire({
				taskId: task.id,
				oldStatus,
				newStatus: task.status
			});
		}
	}

	private _loadTasks() {
		try {
			const rawData = this.storageService.get(STORAGE_KEY, StorageScope.APPLICATION, '[]');
			const parsed: AsyncTask[] = JSON.parse(rawData);
			parsed.forEach(t => this._tasks.set(t.id, t));
		} catch (error) {
			this._log(`Error loading tasks: ${error}`);
		}
	}

	private _saveTasks() {
		try {
			const tasksArray = Array.from(this._tasks.values());
			// Limitar histórico para não estourar storage?
			// Por enquanto mantemos os últimos 100 finalizados + todos pendentes
			const active = tasksArray.filter(t => t.status === 'pending' || t.status === 'processing');
			const inactive = tasksArray.filter(t => t.status !== 'pending' && t.status !== 'processing')
				.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
				.slice(0, 100);

			const toSave = [...active, ...inactive];
			this.storageService.store(STORAGE_KEY, JSON.stringify(toSave), StorageScope.APPLICATION, StorageTarget.MACHINE);
		} catch (error) {
			this._log(`Error saving tasks: ${error}`);
		}
	}

	private _log(message: string): void {
		console.log(`[AsyncTaskQueueService] ${message}`);
	}
}

// Register the service
registerSingleton(IAsyncTaskQueueService, AsyncTaskQueueService, InstantiationType.Delayed);
