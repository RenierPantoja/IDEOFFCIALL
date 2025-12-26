/*--------------------------------------------------------------------------------------
 *  Copyright 2025 RK IDE. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IAIActionLogService } from './aiActionLogService.js';
import { IAutonomousFileService } from './autonomousFileService.js';
import { IAsyncTaskQueueService } from './asyncTaskQueueService.js';
import { IModelSwitchService } from './modelSwitchService.js';
import { IRealtimeCommService, ConnectionState } from './realtimeCommService.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';
import { IApiServerService } from '../common/apiServerService.js';
import {
	ApiResponse,
	SendMessageRequest,
	SendMessageResponse,
	ChangeModelRequest,
	ChangeModelResponse,
	FileOperationRequest,
	FileOperationResponse,
	LogsQueryRequest,
	LogsResponse,
	ChatHistoryResponse,
	ThreadResponse,
	IDEStatusResponse,
	WebSocketMessage,
} from '../common/apiTypes.js';
import { generateUuid } from '../../../../base/common/uuid.js';

/**
 * Interface do serviço de API (browser-side)
 */
export interface IApiService {
	readonly _serviceBrand: undefined;

	/**
	 * Estado do servidor
	 */
	readonly isServerRunning: boolean;

	/**
	 * Porta do servidor
	 */
	readonly serverPort: number;

	/**
	 * Evento quando o servidor inicia
	 */
	readonly onDidStartServer: Event<number>;

	/**
	 * Evento quando o servidor para
	 */
	readonly onDidStopServer: Event<void>;

	/**
	 * Inicia o servidor HTTP
	 */
	startServer(port?: number): Promise<void>;

	/**
	 * Para o servidor HTTP
	 */
	stopServer(): Promise<void>;

	// API Methods (podem ser chamados diretamente ou via HTTP)

	/**
	 * Envia mensagem para o chat
	 */
	sendMessage(request: SendMessageRequest): Promise<ApiResponse<SendMessageResponse>>;

	/**
	 * Troca o modelo de IA
	 */
	changeModel(request: ChangeModelRequest): Promise<ApiResponse<ChangeModelResponse>>;

	/**
	 * Executa operação de arquivo
	 */
	fileOperation(request: FileOperationRequest): Promise<ApiResponse<FileOperationResponse>>;

	/**
	 * Obtém logs
	 */
	getLogs(query?: LogsQueryRequest): Promise<ApiResponse<LogsResponse>>;

	/**
	 * Obtém histórico do chat
	 */
	getChatHistory(): Promise<ApiResponse<ChatHistoryResponse>>;

	/**
	 * Obtém thread específico
	 */
	getThread(threadId: string): Promise<ApiResponse<ThreadResponse>>;

	/**
	 * Obtém status do IDE
	 */
	getStatus(): Promise<ApiResponse<IDEStatusResponse>>;
}

export const IApiService = createDecorator<IApiService>('ApiService');

// Porta padrão do servidor
const DEFAULT_PORT = 23119;

/**
 * Implementação do serviço de API (browser-side)
 *
 * Este serviço coordena a API HTTP/REST para comunicação externa com o IDE.
 * O servidor HTTP real roda no electron-main (ApiServerMainService).
 */
export class ApiService extends Disposable implements IApiService {
	readonly _serviceBrand: undefined;

	private _isServerRunning = false;
	private _serverPort = DEFAULT_PORT;

	private readonly _onDidStartServer = this._register(new Emitter<number>());
	readonly onDidStartServer: Event<number> = this._onDidStartServer.event;

	private readonly _onDidStopServer = this._register(new Emitter<void>());
	readonly onDidStopServer: Event<void> = this._onDidStopServer.event;

	constructor(
		@IAIActionLogService private readonly aiActionLogService: IAIActionLogService,
		@IAutonomousFileService private readonly autonomousFileService: IAutonomousFileService,
		@IAsyncTaskQueueService private readonly asyncTaskQueueService: IAsyncTaskQueueService,
		@IModelSwitchService private readonly modelSwitchService: IModelSwitchService,
		@IRealtimeCommService private readonly realtimeCommService: IRealtimeCommService,
		@IVoidSettingsService private readonly voidSettingsService: IVoidSettingsService,
		@IApiServerService private readonly apiServerService: IApiServerService,
	) {
		super();
		this._log('ApiService initialized');

		// Escutar eventos do servidor
		this._register(this.apiServerService.onDidStart(port => {
			this._isServerRunning = true;
			this._serverPort = port;
			this._onDidStartServer.fire(port);
		}));

		this._register(this.apiServerService.onDidStop(() => {
			this._isServerRunning = false;
			this._onDidStopServer.fire();
		}));

		// Escutar logs e enviar para clientes conectados via WebSocket
		this._register(this.aiActionLogService.onDidLogAction(log => {
			this._broadcastToClients({
				type: 'ai_action_log',
				timestamp: new Date().toISOString(),
				payload: log
			});
		}));

		// Escutar mudanças de modelo
		this._register(this.modelSwitchService.onDidChangeModel(({ oldModel, newModel }) => {
			this._broadcastToClients({
				type: 'model_changed',
				timestamp: new Date().toISOString(),
				payload: { oldModel, newModel }
			});
		}));
	}

	get isServerRunning(): boolean {
		return this._isServerRunning;
	}

	get serverPort(): number {
		return this._serverPort;
	}

	/**
	 * Inicia o servidor HTTP via electron-main
	 */
	async startServer(port: number = DEFAULT_PORT): Promise<void> {
		if (this._isServerRunning) {
			this._log('Server is already running');
			return;
		}

		this._serverPort = port;

		try {
			this._log(`Starting API server on port ${port}...`);

			await this.apiServerService.start({
				port,
				enableCors: true,
				corsOrigins: ['*']
			});

			this._isServerRunning = true;
			this._log(`API server started on port ${port}`);

			// Log da ação
			this.aiActionLogService.logAction(
				'create',
				'System',
				'API Server Started',
				'baixo',
				`Servidor API iniciado na porta ${port}`
			);
		} catch (error) {
			this._log(`Error starting server: ${error}`);
			throw error;
		}
	}

	/**
	 * Para o servidor HTTP
	 */
	async stopServer(): Promise<void> {
		if (!this._isServerRunning) {
			return;
		}

		this._log('Stopping API server...');
		await this.apiServerService.stop();
		this._isServerRunning = false;
		this._log('API server stopped');
	}

	/**
	 * Envia mensagem para todos os clientes conectados via WebSocket
	 */
	private _broadcastToClients(message: WebSocketMessage): void {
		if (this._isServerRunning) {
			this.apiServerService.broadcast(message.type, message.payload);
		}
	}

	// ============================================
	// API Methods
	// ============================================

	/**
	 * Envia mensagem para o chat
	 */
	async sendMessage(request: SendMessageRequest): Promise<ApiResponse<SendMessageResponse>> {
		try {
			const threadId = request.threadId || generateUuid();
			const messageId = generateUuid();

			// Criar tarefa assíncrona para processar a mensagem
			await this.asyncTaskQueueService.queueTask(
				'Chat Message',
				request.message,
				'chat_message',
				{
					threadId,
					messageId,
					message: request.message,
					context: request.context
				},
				'high'
			);

			// Log da ação
			this.aiActionLogService.logAction(
				'create',
				'Chat',
				'Mensagem recebida via API',
				'baixo',
				`Mensagem enviada para thread ${threadId}`
			);

			return {
				success: true,
				data: {
					threadId,
					messageId,
					status: 'queued'
				},
				timestamp: new Date().toISOString()
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				timestamp: new Date().toISOString()
			};
		}
	}

	/**
	 * Troca o modelo de IA
	 */
	async changeModel(request: ChangeModelRequest): Promise<ApiResponse<ChangeModelResponse>> {
		try {
			const modelSelectionOfFeature = this.voidSettingsService.state.modelSelectionOfFeature;
			const currentSelection = modelSelectionOfFeature['Chat'];
			const currentModel = currentSelection?.modelName || 'unknown';

			const success = await this.modelSwitchService.switchModel(
				request.modelName,
				request.reason || 'Troca via API externa'
			);

			return {
				success,
				data: {
					previousModel: currentModel,
					newModel: request.modelName,
					success
				},
				timestamp: new Date().toISOString()
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				timestamp: new Date().toISOString()
			};
		}
	}

	/**
	 * Executa operação de arquivo
	 */
	async fileOperation(request: FileOperationRequest): Promise<ApiResponse<FileOperationResponse>> {
		try {
			const reason = request.reason || 'Operação via API externa';

			switch (request.operation) {
				case 'read': {
					const result = await this.autonomousFileService.readFile(request.path);
					return {
						success: true,
						data: {
							success: true,
							path: request.path,
							content: result.content
						},
						timestamp: new Date().toISOString()
					};
				}

				case 'create': {
					const result = await this.autonomousFileService.createFile(
						request.path,
						request.content || '',
						reason
					);
					return {
						success: result.success,
						data: {
							success: result.success,
							path: request.path,
							checkpointId: result.checkpointId
						},
						error: result.errors?.join(', '),
						timestamp: new Date().toISOString()
					};
				}

				case 'update': {
					const result = await this.autonomousFileService.updateFile(
						request.path,
						request.content || '',
						reason
					);
					return {
						success: result.success,
						data: {
							success: result.success,
							path: request.path,
							checkpointId: result.checkpointId
						},
						error: result.errors?.join(', '),
						timestamp: new Date().toISOString()
					};
				}

				case 'delete': {
					const result = await this.autonomousFileService.deleteFile(request.path, reason);
					return {
						success: result.success,
						data: {
							success: result.success,
							path: request.path,
							checkpointId: result.checkpointId
						},
						error: result.errors?.join(', '),
						timestamp: new Date().toISOString()
					};
				}

				default:
					throw new Error(`Operação desconhecida: ${request.operation}`);
			}
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				timestamp: new Date().toISOString()
			};
		}
	}

	/**
	 * Obtém logs
	 */
	async getLogs(query?: LogsQueryRequest): Promise<ApiResponse<LogsResponse>> {
		try {
			const logs = this.aiActionLogService.getFilteredLogs({
				action: query?.action,
				impact: query?.impact,
				filePattern: query?.filePattern,
				fromDate: query?.fromDate,
				toDate: query?.toDate
			});

			const limit = query?.limit || 100;
			const limitedLogs = logs.slice(0, limit);

			return {
				success: true,
				data: {
					logs: limitedLogs,
					total: logs.length,
					hasMore: logs.length > limit
				},
				timestamp: new Date().toISOString()
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				timestamp: new Date().toISOString()
			};
		}
	}

	/**
	 * Obtém histórico do chat
	 */
	async getChatHistory(): Promise<ApiResponse<ChatHistoryResponse>> {
		try {
			// TODO: Implementar quando resolver dependência circular com chatThreadService
			return {
				success: true,
				data: { threads: [] },
				timestamp: new Date().toISOString()
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				timestamp: new Date().toISOString()
			};
		}
	}

	/**
	 * Obtém thread específico
	 */
	async getThread(threadId: string): Promise<ApiResponse<ThreadResponse>> {
		try {
			// TODO: Implementar quando resolver dependência circular com chatThreadService
			return {
				success: false,
				error: `Thread não encontrado: ${threadId}`,
				timestamp: new Date().toISOString()
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				timestamp: new Date().toISOString()
			};
		}
	}

	/**
	 * Obtém status do IDE
	 */
	async getStatus(): Promise<ApiResponse<IDEStatusResponse>> {
		try {
			const modelSelectionOfFeature = this.voidSettingsService.state.modelSelectionOfFeature;
			const currentSelection = modelSelectionOfFeature['Chat'];
			const logsState = this.aiActionLogService.state;
			const pendingTasks = this.asyncTaskQueueService.getPendingTasks();

			return {
				success: true,
				data: {
					connected: this.realtimeCommService.connectionState === ConnectionState.Connected,
					currentModel: currentSelection?.modelName || 'none',
					currentProvider: currentSelection?.providerName || 'none',
					logsCount: logsState.logs.length,
					pendingTasks: pendingTasks.length
				},
				timestamp: new Date().toISOString()
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				timestamp: new Date().toISOString()
			};
		}
	}

	private _log(message: string): void {
		console.log(`[ApiService] ${message}`);
	}
}

// Register the service
registerSingleton(IApiService, ApiService, InstantiationType.Delayed);
