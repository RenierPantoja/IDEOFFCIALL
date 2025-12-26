/*--------------------------------------------------------------------------------------
 *  Copyright 2025 RK IDE. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { AIActionLog, AIActionLogFilter, AIActionLogState, createAIActionLog } from '../common/aiActionLogTypes.js';

// Maximum number of logs to keep in memory
const MAX_LOGS_IN_MEMORY = 1000;

/**
 * Interface do serviço de logging de ações da IA
 */
export interface IAIActionLogService {
	readonly _serviceBrand: undefined;

	/**
	 * Estado atual do serviço
	 */
	readonly state: AIActionLogState;

	/**
	 * Evento disparado quando uma nova ação é logada
	 */
	readonly onDidLogAction: Event<AIActionLog>;

	/**
	 * Evento disparado quando o estado muda
	 */
	readonly onDidChangeState: Event<AIActionLogState>;

	/**
	 * Registra uma ação da IA
	 */
	logAction(
		action: AIActionLog['action'],
		file: string,
		reason: string,
		impact: AIActionLog['impact'],
		details: string,
		threadId?: string
	): AIActionLog;

	/**
	 * Registra um log completo
	 */
	logComplete(log: AIActionLog): void;

	/**
	 * Obtém logs recentes
	 */
	getRecentLogs(count?: number): AIActionLog[];

	/**
	 * Obtém logs filtrados
	 */
	getFilteredLogs(filter: AIActionLogFilter): AIActionLog[];

	/**
	 * Obtém logs de um arquivo específico
	 */
	getLogsByFile(filePath: string): AIActionLog[];

	/**
	 * Obtém logs de um thread específico
	 */
	getLogsByThread(threadId: string): AIActionLog[];

	/**
	 * Limpa todos os logs
	 */
	clearLogs(): void;

	/**
	 * Exporta logs para JSON
	 */
	exportLogs(): string;

	/**
	 * Pausa o logging
	 */
	pause(): void;

	/**
	 * Retoma o logging
	 */
	resume(): void;
}

export const IAIActionLogService = createDecorator<IAIActionLogService>('AIActionLogService');

/**
 * Implementação do serviço de logging de ações da IA
 *
 * Este serviço é responsável por:
 * - Registrar todas as ações executadas pela IA
 * - Emitir eventos para atualização do frontend em tempo real
 * - Manter histórico de ações para auditoria
 * - Permitir filtros e buscas no histórico
 */
export class AIActionLogService extends Disposable implements IAIActionLogService {
	readonly _serviceBrand: undefined;

	private _state: AIActionLogState = {
		logs: [],
		isActive: true,
		lastError: undefined
	};

	private readonly _onDidLogAction = this._register(new Emitter<AIActionLog>());
	readonly onDidLogAction: Event<AIActionLog> = this._onDidLogAction.event;

	private readonly _onDidChangeState = this._register(new Emitter<AIActionLogState>());
	readonly onDidChangeState: Event<AIActionLogState> = this._onDidChangeState.event;

	constructor() {
		super();
		this._log('AIActionLogService initialized');
	}

	get state(): AIActionLogState {
		return { ...this._state };
	}

	/**
	 * Registra uma ação da IA
	 */
	logAction(
		action: AIActionLog['action'],
		file: string,
		reason: string,
		impact: AIActionLog['impact'],
		details: string,
		threadId?: string
	): AIActionLog {
		const log = createAIActionLog(action, file, reason, impact, details, threadId);
		this.logComplete(log);
		return log;
	}

	/**
	 * Registra um log completo
	 */
	logComplete(log: AIActionLog): void {
		if (!this._state.isActive) {
			this._log('Logging is paused, skipping log');
			return;
		}

		// Add to state
		this._state.logs.unshift(log);

		// Trim logs if exceeding max
		if (this._state.logs.length > MAX_LOGS_IN_MEMORY) {
			this._state.logs = this._state.logs.slice(0, MAX_LOGS_IN_MEMORY);
		}

		// Emit events
		this._onDidLogAction.fire(log);
		this._onDidChangeState.fire(this.state);

		// Console log for debugging
		this._logActionToConsole(log);
	}

	/**
	 * Obtém logs recentes
	 */
	getRecentLogs(count: number = 50): AIActionLog[] {
		return this._state.logs.slice(0, count);
	}

	/**
	 * Obtém logs filtrados
	 */
	getFilteredLogs(filter: AIActionLogFilter): AIActionLog[] {
		let filtered = [...this._state.logs];

		if (filter.action) {
			filtered = filtered.filter(log => log.action === filter.action);
		}

		if (filter.impact) {
			filtered = filtered.filter(log => log.impact === filter.impact);
		}

		if (filter.filePattern) {
			const regex = new RegExp(filter.filePattern, 'i');
			filtered = filtered.filter(log => regex.test(log.file));
		}

		if (filter.fromDate) {
			const fromDate = new Date(filter.fromDate);
			filtered = filtered.filter(log => new Date(log.timestamp) >= fromDate);
		}

		if (filter.toDate) {
			const toDate = new Date(filter.toDate);
			filtered = filtered.filter(log => new Date(log.timestamp) <= toDate);
		}

		return filtered;
	}

	/**
	 * Obtém logs de um arquivo específico
	 */
	getLogsByFile(filePath: string): AIActionLog[] {
		const normalizedPath = filePath.toLowerCase().replace(/\\/g, '/');
		return this._state.logs.filter(log =>
			log.file.toLowerCase().replace(/\\/g, '/').includes(normalizedPath)
		);
	}

	/**
	 * Obtém logs de um thread específico
	 */
	getLogsByThread(threadId: string): AIActionLog[] {
		return this._state.logs.filter(log => log.threadId === threadId);
	}

	/**
	 * Limpa todos os logs
	 */
	clearLogs(): void {
		this._state.logs = [];
		this._onDidChangeState.fire(this.state);
		this._log('All logs cleared');
	}

	/**
	 * Exporta logs para JSON
	 */
	exportLogs(): string {
		return JSON.stringify(this._state.logs, null, 2);
	}

	/**
	 * Pausa o logging
	 */
	pause(): void {
		this._state.isActive = false;
		this._onDidChangeState.fire(this.state);
		this._log('Logging paused');
	}

	/**
	 * Retoma o logging
	 */
	resume(): void {
		this._state.isActive = true;
		this._onDidChangeState.fire(this.state);
		this._log('Logging resumed');
	}

	/**
	 * Log interno para debugging
	 */
	private _log(message: string): void {
		console.log(`[AIActionLogService] ${message}`);
	}

	/**
	 * Loga a ação no console para debugging
	 */
	private _logActionToConsole(log: AIActionLog): void {
		const impactEmoji = {
			'baixo': '🟢',
			'médio': '🟡',
			'alto': '🔴'
		};

		const actionEmoji = {
			'read': '📖',
			'create': '✨',
			'update': '📝',
			'delete': '🗑️'
		};

		console.log(
			`${impactEmoji[log.impact]} ${actionEmoji[log.action]} [AI Action] ${log.action.toUpperCase()} ${log.file}\n` +
			`   Reason: ${log.reason}\n` +
			`   Details: ${log.details}\n` +
			`   Impact: ${log.impact}\n` +
			`   Time: ${log.timestamp}`
		);
	}
}

// Register the service
registerSingleton(IAIActionLogService, AIActionLogService, InstantiationType.Delayed);
