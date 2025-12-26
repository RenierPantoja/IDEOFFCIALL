/*--------------------------------------------------------------------------------------
 *  Copyright 2025 RK IDE. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IAIActionLogService } from './aiActionLogService.js';
import { IRealtimeCommService } from './realtimeCommService.js';

export interface RetryOptions {
	/** Número máximo de tentativas (padrão: 3) */
	maxAttempts?: number;

	/** Delay inicial em ms (padrão: 1000) */
	initialDelay?: number;

	/** Fator de backoff exponencial (padrão: 2) */
	backoffFactor?: number;

	/** Erros que não devem ser retentados */
	nonRetryableErrors?: any[];
}

export interface IErrorHandlingService {
	readonly _serviceBrand: undefined;

	/**
	 * Tenta executar uma operação com estratégia de retry
	 */
	withRetry<T>(
		operation: () => Promise<T>,
		retryOptions?: RetryOptions,
		context?: string
	): Promise<T>;

	/**
	 * Registra um erro e notifica o usuário se necessário
	 */
	handleError(error: unknown, context: string, severity?: 'baixo' | 'médio' | 'alto'): void;
}

export const IErrorHandlingService = createDecorator<IErrorHandlingService>('ErrorHandlingService');

export class ErrorHandlingService extends Disposable implements IErrorHandlingService {
	readonly _serviceBrand: undefined;

	constructor(
		@IAIActionLogService private readonly aiActionLogService: IAIActionLogService,
		@IRealtimeCommService private readonly realtimeCommService: IRealtimeCommService
	) {
		super();
		this._log('ErrorHandlingService initialized');
	}

	async withRetry<T>(
		operation: () => Promise<T>,
		{
			maxAttempts = 3,
			initialDelay = 1000,
			backoffFactor = 2,
			nonRetryableErrors = []
		}: RetryOptions = {},
		context: string = 'Operation'
	): Promise<T> {
		let lastError: unknown;
		let delay = initialDelay;

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				return await operation();
			} catch (error) {
				lastError = error;

				// Verifica se erro deve abortar retry
				if (nonRetryableErrors.some(cls => error instanceof cls)) {
					throw error;
				}

				if (attempt === maxAttempts) {
					break;
				}

				this._log(`Retry attempt ${attempt}/${maxAttempts} for ${context} failed. Retrying in ${delay}ms...`);
				this.aiActionLogService.logAction('read', 'System', 'Retry Attempt', 'baixo', `Attempt ${attempt} for ${context} failed: ${error}. Retrying...`);

				await new Promise(resolve => setTimeout(resolve, delay));
				delay *= backoffFactor;
			}
		}

		this.handleError(lastError, context, 'alto');
		throw lastError;
	}

	handleError(error: unknown, context: string, severity: 'baixo' | 'médio' | 'alto' = 'médio'): void {
		const errorMessage = error instanceof Error ? error.message : String(error);
		const fullMessage = `Error in ${context}: ${errorMessage}`;

		this._log(fullMessage);

		// Log na ação da IA
		this.aiActionLogService.logAction(
			'update',
			'System',
			'Error Occurred',
			severity,
			fullMessage
		);

		// Notificar frontend via WebSocket se for crítico
		if (severity === 'alto') {
			this.realtimeCommService.sendMessage('notification', {
				type: 'error',
				title: `Critical Error in ${context}`,
				message: errorMessage,
				timestamp: new Date().toISOString()
			});
		}
	}

	private _log(message: string): void {
		console.error(`[ErrorHandlingService] ${message}`);
	}
}

// Register the service
registerSingleton(IErrorHandlingService, ErrorHandlingService, InstantiationType.Delayed);
