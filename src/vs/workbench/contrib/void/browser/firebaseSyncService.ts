/*--------------------------------------------------------------------------------------
 *  Copyright 2025 RK IDE. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IAIActionLogService } from './aiActionLogService.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';
import { IModelSwitchService } from './modelSwitchService.js';
import { IAutonomousFileService } from './autonomousFileService.js';
import { IAsyncTaskQueueService } from './asyncTaskQueueService.js';
import {
	FirebaseConfig,
	FirebaseSyncState,
	FirebaseCommand,
	FirebaseUserProfile,
	FirebaseIDEStatus,
	FirebaseActionLog,
	CommandStatus,
	SendMessagePayload,
	ChangeModelPayload,
	FileOperationPayload,
	GetLogsPayload,
	GetThreadPayload,
} from '../common/firebaseSyncTypes.js';

// Storage keys
const FIREBASE_USER_ID_KEY = 'void.firebase.userId';
const FIREBASE_CONFIG_KEY = 'void.firebase.config';

/**
 * Interface do serviço de sincronização Firebase
 */
export interface IFirebaseSyncService {
	readonly _serviceBrand: undefined;

	/** Estado atual da sincronização */
	readonly state: FirebaseSyncState;

	/** Evento quando o estado muda */
	readonly onDidChangeState: Event<FirebaseSyncState>;

	/** Evento quando um comando é recebido */
	readonly onDidReceiveCommand: Event<FirebaseCommand>;

	/** Inicializa a conexão com Firebase */
	initialize(config: FirebaseConfig): Promise<void>;

	/** Desconecta do Firebase */
	disconnect(): Promise<void>;

	/** Obtém ou cria o userId */
	getUserId(): string;

	/** Atualiza o status do IDE no Firebase */
	updateStatus(): Promise<void>;

	/** Sincroniza logs com Firebase */
	syncLogs(): Promise<void>;

	/** Sincroniza chat com Firebase */
	syncChat(): Promise<void>;

	/** Processa comandos pendentes */
	processCommands(): Promise<void>;
}

export const IFirebaseSyncService = createDecorator<IFirebaseSyncService>('firebaseSyncService');

/**
 * Implementação do serviço de sincronização Firebase
 *
 * Este serviço permite que o IDE se comunique com sites externos
 * através do Firebase Firestore, eliminando a necessidade de
 * conexão direta localhost.
 */
export class FirebaseSyncService extends Disposable implements IFirebaseSyncService {
	readonly _serviceBrand: undefined;

	private _state: FirebaseSyncState = {
		isConnected: false,
		userId: null,
		lastSync: null,
		pendingCommands: 0,
		error: null
	};

	private _config: FirebaseConfig | null = null;
	private _syncInterval: ReturnType<typeof setInterval> | null = null;
	private _unsubscribeCommands: (() => void) | null = null;

	private readonly _onDidChangeState = this._register(new Emitter<FirebaseSyncState>());
	readonly onDidChangeState: Event<FirebaseSyncState> = this._onDidChangeState.event;

	private readonly _onDidReceiveCommand = this._register(new Emitter<FirebaseCommand>());
	readonly onDidReceiveCommand: Event<FirebaseCommand> = this._onDidReceiveCommand.event;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IAIActionLogService private readonly aiActionLogService: IAIActionLogService,
		@IVoidSettingsService private readonly voidSettingsService: IVoidSettingsService,
		@IModelSwitchService private readonly modelSwitchService: IModelSwitchService,
		@IAutonomousFileService private readonly autonomousFileService: IAutonomousFileService,
		@IAsyncTaskQueueService private readonly asyncTaskQueueService: IAsyncTaskQueueService,
	) {
		super();
		this._log('FirebaseSyncService initialized');

		// Carregar userId existente
		const savedUserId = this.storageService.get(FIREBASE_USER_ID_KEY, StorageScope.APPLICATION);
		if (savedUserId) {
			this._state.userId = savedUserId;
		}

		// Escutar mudanças de logs para sincronizar
		this._register(this.aiActionLogService.onDidLogAction(() => {
			if (this._state.isConnected) {
				this.syncLogs();
			}
		}));

		// Escutar mudanças de modelo
		this._register(this.modelSwitchService.onDidChangeModel(() => {
			if (this._state.isConnected) {
				this.updateStatus();
			}
		}));
	}

	get state(): FirebaseSyncState {
		return { ...this._state };
	}

	/**
	 * Obtém ou cria o userId único para este usuário/máquina
	 */
	getUserId(): string {
		if (!this._state.userId) {
			const newUserId = `user_${generateUuid()}`;
			this.storageService.store(FIREBASE_USER_ID_KEY, newUserId, StorageScope.APPLICATION, StorageTarget.MACHINE);
			this._state.userId = newUserId;
			this._updateState();
		}
		return this._state.userId;
	}

	/**
	 * Inicializa a conexão com Firebase
	 */
	async initialize(config: FirebaseConfig): Promise<void> {
		if (this._state.isConnected) {
			this._log('Already connected to Firebase');
			return;
		}

		try {
			this._log('Initializing Firebase connection...');
			this._config = config;

			// Salvar config
			this.storageService.store(
				FIREBASE_CONFIG_KEY,
				JSON.stringify(config),
				StorageScope.APPLICATION,
				StorageTarget.USER
			);

			// Inicializar Firebase (usando fetch para Firestore REST API)
			// Nota: Em produção, usar o SDK oficial do Firebase
			await this._initializeFirestore();

			// Garantir userId
			const userId = this.getUserId();

			// Criar/atualizar perfil do usuário
			await this._updateUserProfile();

			// Começar a escutar comandos
			await this._startCommandListener();

			// Iniciar sincronização periódica
			this._startSyncInterval();

			this._state.isConnected = true;
			this._state.error = null;
			this._updateState();

			this._log(`Connected to Firebase as ${userId}`);

			// Sincronização inicial
			await this.updateStatus();
			await this.syncLogs();
			await this.syncChat();

		} catch (error) {
			this._state.error = error instanceof Error ? error.message : String(error);
			this._state.isConnected = false;
			this._updateState();
			this._log(`Error connecting to Firebase: ${this._state.error}`);
			throw error;
		}
	}

	/**
	 * Desconecta do Firebase
	 */
	async disconnect(): Promise<void> {
		if (!this._state.isConnected) {
			return;
		}

		this._log('Disconnecting from Firebase...');

		// Parar listener de comandos
		if (this._unsubscribeCommands) {
			this._unsubscribeCommands();
			this._unsubscribeCommands = null;
		}

		// Parar sincronização periódica
		if (this._syncInterval) {
			clearInterval(this._syncInterval);
			this._syncInterval = null;
		}

		// Atualizar status como desconectado
		try {
			await this._setDocument(`users/${this._state.userId}/status`, 'current', {
				connected: false,
				lastUpdate: new Date().toISOString()
			});
		} catch { }

		this._state.isConnected = false;
		this._updateState();

		this._log('Disconnected from Firebase');
	}

	/**
	 * Atualiza o status do IDE no Firebase
	 */
	async updateStatus(): Promise<void> {
		if (!this._state.isConnected || !this._state.userId) {
			return;
		}

		try {
			const modelSelection = this.voidSettingsService.state.modelSelectionOfFeature['Chat'];
			const logsState = this.aiActionLogService.state;
			const pendingTasks = this.asyncTaskQueueService.getPendingTasks();

			const status: FirebaseIDEStatus = {
				connected: true,
				currentModel: modelSelection?.modelName || 'none',
				currentProvider: modelSelection?.providerName || 'none',
				logsCount: logsState.logs.length,
				pendingTasks: pendingTasks.length,
				lastUpdate: new Date().toISOString()
			};

			await this._setDocument(`users/${this._state.userId}/status`, 'current', status);
			this._log('Status updated in Firebase');

		} catch (error) {
			this._log(`Error updating status: ${error}`);
		}
	}

	/**
	 * Sincroniza logs com Firebase
	 */
	async syncLogs(): Promise<void> {
		if (!this._state.isConnected || !this._state.userId) {
			return;
		}

		try {
			const recentLogs = this.aiActionLogService.getRecentLogs(50);

			for (const log of recentLogs) {
				const firebaseLog: FirebaseActionLog = {
					id: log.id,
					action: log.action,
					file: log.file,
					reason: log.reason,
					impact: log.impact,
					details: log.details,
					timestamp: log.timestamp
				};

				await this._setDocument(
					`users/${this._state.userId}/logs`,
					log.id,
					firebaseLog
				);
			}

			this._state.lastSync = new Date().toISOString();
			this._updateState();

		} catch (error) {
			this._log(`Error syncing logs: ${error}`);
		}
	}

	/**
	 * Sincroniza chat com Firebase
	 */
	async syncChat(): Promise<void> {
		if (!this._state.isConnected || !this._state.userId) {
			return;
		}

		// TODO: Implementar quando resolver dependência circular com chatThreadService
		this._log('syncChat: Chat sync temporarily disabled');
	}

	/**
	 * Processa comandos pendentes do Firebase
	 */
	async processCommands(): Promise<void> {
		if (!this._state.isConnected || !this._state.userId) {
			return;
		}

		try {
			// Buscar comandos pendentes
			const commands = await this._getCollection<FirebaseCommand>(
				`users/${this._state.userId}/commands`
			);

			const pendingCommands = commands.filter(cmd => cmd.status === 'pending');
			this._state.pendingCommands = pendingCommands.length;
			this._updateState();

			for (const command of pendingCommands) {
				await this._processCommand(command);
			}

		} catch (error) {
			this._log(`Error processing commands: ${error}`);
		}
	}

	// ============================================
	// Private Methods
	// ============================================

	private async _initializeFirestore(): Promise<void> {
		// Usando Firestore REST API para simplicidade
		// Em produção, usar o SDK oficial
		// Config já está em this._config
	}

	private async _updateUserProfile(): Promise<void> {
		const profile: FirebaseUserProfile = {
			userId: this._state.userId!,
			createdAt: new Date().toISOString(),
			lastSeen: new Date().toISOString(),
			ideConnected: true,
			ideVersion: '1.0.0'
		};

		await this._setDocument(`users/${this._state.userId}`, 'profile', profile);
	}

	private async _startCommandListener(): Promise<void> {
		// Polling para comandos (em produção, usar onSnapshot do Firebase)
		const checkCommands = async () => {
			if (this._state.isConnected) {
				await this.processCommands();
			}
		};

		// Verificar a cada 2 segundos
		this._syncInterval = setInterval(checkCommands, 2000);
	}

	private _startSyncInterval(): void {
		// Sincronização periódica a cada 30 segundos
		setInterval(() => {
			if (this._state.isConnected) {
				this.updateStatus();
			}
		}, 30000);
	}

	private async _processCommand(command: FirebaseCommand): Promise<void> {
		this._log(`Processing command: ${command.type}`);

		// Marcar como processando
		await this._updateCommandStatus(command.id, 'processing');

		try {
			let result: unknown;

			switch (command.type) {
				case 'send_message':
					result = await this._handleSendMessage(command.payload as SendMessagePayload);
					break;

				case 'change_model':
					result = await this._handleChangeModel(command.payload as ChangeModelPayload);
					break;

				case 'file_operation':
					result = await this._handleFileOperation(command.payload as FileOperationPayload);
					break;

				case 'get_status':
					result = await this._handleGetStatus();
					break;

				case 'get_logs':
					result = await this._handleGetLogs(command.payload as GetLogsPayload);
					break;

				case 'get_chat_history':
					result = await this._handleGetChatHistory();
					break;

				case 'get_thread':
					result = await this._handleGetThread(command.payload as GetThreadPayload);
					break;

				default:
					throw new Error(`Unknown command type: ${command.type}`);
			}

			// Marcar como completado
			await this._updateCommandStatus(command.id, 'completed', result);
			this._onDidReceiveCommand.fire({ ...command, status: 'completed', result });

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			await this._updateCommandStatus(command.id, 'error', undefined, errorMessage);
			this._onDidReceiveCommand.fire({ ...command, status: 'error', error: errorMessage });
		}
	}

	private async _handleSendMessage(payload: SendMessagePayload): Promise<unknown> {
		const threadId = payload.threadId || generateUuid();
		const messageId = generateUuid();

		await this.asyncTaskQueueService.queueTask(
			'Chat Message',
			payload.message,
			'chat_message',
			{
				threadId,
				messageId,
				message: payload.message,
				context: payload.context
			},
			'high'
		);

		return { threadId, messageId, status: 'queued' };
	}

	private async _handleChangeModel(payload: ChangeModelPayload): Promise<unknown> {
		const modelSelection = this.voidSettingsService.state.modelSelectionOfFeature['Chat'];
		const previousModel = modelSelection?.modelName || 'none';

		const success = await this.modelSwitchService.switchModel(
			payload.modelName,
			payload.reason || 'Troca via Firebase'
		);

		return { previousModel, newModel: payload.modelName, success };
	}

	private async _handleFileOperation(payload: FileOperationPayload): Promise<unknown> {
		const reason = payload.reason || 'Operação via Firebase';

		switch (payload.operation) {
			case 'read': {
				const result = await this.autonomousFileService.readFile(payload.path);
				return { success: true, path: payload.path, content: result.content };
			}
			case 'create': {
				const result = await this.autonomousFileService.createFile(payload.path, payload.content || '', reason);
				return { success: result.success, path: payload.path, checkpointId: result.checkpointId };
			}
			case 'update': {
				const result = await this.autonomousFileService.updateFile(payload.path, payload.content || '', reason);
				return { success: result.success, path: payload.path, checkpointId: result.checkpointId };
			}
			case 'delete': {
				const result = await this.autonomousFileService.deleteFile(payload.path, reason);
				return { success: result.success, path: payload.path, checkpointId: result.checkpointId };
			}
			default:
				throw new Error(`Unknown operation: ${payload.operation}`);
		}
	}

	private async _handleGetStatus(): Promise<FirebaseIDEStatus> {
		const modelSelection = this.voidSettingsService.state.modelSelectionOfFeature['Chat'];
		const logsState = this.aiActionLogService.state;
		const pendingTasks = this.asyncTaskQueueService.getPendingTasks();

		return {
			connected: true,
			currentModel: modelSelection?.modelName || 'none',
			currentProvider: modelSelection?.providerName || 'none',
			logsCount: logsState.logs.length,
			pendingTasks: pendingTasks.length,
			lastUpdate: new Date().toISOString()
		};
	}

	private async _handleGetLogs(payload: GetLogsPayload): Promise<unknown> {
		const logs = this.aiActionLogService.getFilteredLogs({
			action: payload.action as any,
			impact: payload.impact as any,
			fromDate: payload.fromDate,
			toDate: payload.toDate
		});

		const limit = payload.limit || 100;
		return {
			logs: logs.slice(0, limit),
			total: logs.length,
			hasMore: logs.length > limit
		};
	}

	private async _handleGetChatHistory(): Promise<unknown> {
		// TODO: Implementar quando resolver dependência circular com chatThreadService
		return { threads: [] };
	}

	private async _handleGetThread(payload: GetThreadPayload): Promise<unknown> {
		// TODO: Implementar quando resolver dependência circular com chatThreadService
		throw new Error(`Thread not found: ${payload.threadId}`);
	}

	private async _updateCommandStatus(
		commandId: string,
		status: CommandStatus,
		result?: unknown,
		error?: string
	): Promise<void> {
		const update: Partial<FirebaseCommand> = {
			status,
			processedAt: new Date().toISOString()
		};

		if (result !== undefined) {
			update.result = result;
		}
		if (error) {
			update.error = error;
		}

		await this._updateDocument(`users/${this._state.userId}/commands`, commandId, update);
	}

	// ============================================
	// Firestore REST API Helpers
	// ============================================

	private async _setDocument(collection: string, docId: string, data: unknown): Promise<void> {
		if (!this._config) throw new Error('Firebase not configured');

		const url = `https://firestore.googleapis.com/v1/projects/${this._config.projectId}/databases/(default)/documents/${collection}/${docId}`;

		const response = await fetch(url, {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				fields: this._toFirestoreFields(data)
			})
		});

		if (!response.ok) {
			throw new Error(`Firestore error: ${response.statusText}`);
		}
	}

	private async _updateDocument(collection: string, docId: string, data: Partial<unknown>): Promise<void> {
		await this._setDocument(collection, docId, data);
	}

	private async _getCollection<T>(collection: string): Promise<T[]> {
		if (!this._config) throw new Error('Firebase not configured');

		const url = `https://firestore.googleapis.com/v1/projects/${this._config.projectId}/databases/(default)/documents/${collection}`;

		const response = await fetch(url);

		if (!response.ok) {
			if (response.status === 404) return [];
			throw new Error(`Firestore error: ${response.statusText}`);
		}

		const result = await response.json();
		if (!result.documents) return [];

		return result.documents.map((doc: any) => this._fromFirestoreFields(doc.fields));
	}

	private _toFirestoreFields(data: unknown): Record<string, unknown> {
		const fields: Record<string, unknown> = {};

		if (typeof data !== 'object' || data === null) {
			return fields;
		}

		for (const [key, value] of Object.entries(data)) {
			fields[key] = this._toFirestoreValue(value);
		}

		return fields;
	}

	private _toFirestoreValue(value: unknown): unknown {
		if (value === null) return { nullValue: null };
		if (typeof value === 'boolean') return { booleanValue: value };
		if (typeof value === 'number') return { integerValue: String(value) };
		if (typeof value === 'string') return { stringValue: value };
		if (Array.isArray(value)) {
			return { arrayValue: { values: value.map(v => this._toFirestoreValue(v)) } };
		}
		if (typeof value === 'object') {
			return { mapValue: { fields: this._toFirestoreFields(value) } };
		}
		return { stringValue: String(value) };
	}

	private _fromFirestoreFields(fields: Record<string, any>): any {
		const result: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(fields)) {
			result[key] = this._fromFirestoreValue(value);
		}

		return result;
	}

	private _fromFirestoreValue(value: any): unknown {
		if ('nullValue' in value) return null;
		if ('booleanValue' in value) return value.booleanValue;
		if ('integerValue' in value) return parseInt(value.integerValue, 10);
		if ('doubleValue' in value) return value.doubleValue;
		if ('stringValue' in value) return value.stringValue;
		if ('arrayValue' in value) {
			return (value.arrayValue.values || []).map((v: any) => this._fromFirestoreValue(v));
		}
		if ('mapValue' in value) {
			return this._fromFirestoreFields(value.mapValue.fields || {});
		}
		return null;
	}

	private _updateState(): void {
		this._onDidChangeState.fire(this.state);
	}

	private _log(message: string): void {
		console.log(`[FirebaseSyncService] ${message}`);
	}

	override dispose(): void {
		this.disconnect();
		super.dispose();
	}
}

// Register the service
registerSingleton(IFirebaseSyncService, FirebaseSyncService, InstantiationType.Delayed);
