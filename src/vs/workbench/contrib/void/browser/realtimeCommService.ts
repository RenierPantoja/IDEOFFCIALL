/*--------------------------------------------------------------------------------------
 *  Copyright 2025 RK IDE. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IAIActionLogService } from './aiActionLogService.js';

/**
 * Estado da conexão em tempo real
 */
export enum ConnectionState {
	Disconnected = 'disconnected',
	Connecting = 'connecting',
	Connected = 'connected',
	Reconnecting = 'reconnecting',
	Error = 'error'
}

/**
 * Interface do serviço de comunicação em tempo real
 */
export interface IRealtimeCommService {
	readonly _serviceBrand: undefined;

	/**
	 * Estado atual da conexão
	 */
	readonly connectionState: ConnectionState;

	/**
	 * Evento disparado quando o estado da conexão muda
	 */
	readonly onDidChangeConnectionState: Event<ConnectionState>;

	/**
	 * Evento disparado quando uma mensagem externa é recebida
	 */
	readonly onDidReceiveExternalMessage: Event<any>;

	/**
	 * Conecta ao servidor WebSocket
	 */
	connect(url?: string): Promise<void>;

	/**
	 * Desconecta do servidor
	 */
	disconnect(): void;

	/**
	 * Envia uma mensagem para o servidor
	 */
	sendMessage(type: string, payload: any): void;
}

export const IRealtimeCommService = createDecorator<IRealtimeCommService>('RealtimeCommService');

/**
 * Implementação do serviço de comunicação em tempo real
 *
 * Responsável por manter uma conexão persistente com o backend/frontend
 * para streaming de logs e comandos em tempo real.
 */
export class RealtimeCommService extends Disposable implements IRealtimeCommService {
	readonly _serviceBrand: undefined;

	private _connectionState: ConnectionState = ConnectionState.Disconnected;
	private _socket: WebSocket | null = null;
	private _reconnectAttempts = 0;
	private _reconnectTimeout: any = null;
	private readonly _maxReconnectAttempts = 5;
	private readonly _reconnectDelay = 2000;

	private readonly _onDidChangeConnectionState = this._register(new Emitter<ConnectionState>());
	readonly onDidChangeConnectionState: Event<ConnectionState> = this._onDidChangeConnectionState.event;

	constructor(
		@IAIActionLogService private readonly aiActionLogService: IAIActionLogService
	) {
		super();
		this._log('RealtimeCommService initialized');

		// Listen for logs and send them over socket if connected
		this._register(this.aiActionLogService.onDidLogAction(log => {
			this.sendMessage('ai_action_log', log);
		}));
	}

	get connectionState(): ConnectionState {
		return this._connectionState;
	}

	private _setConnectionState(state: ConnectionState): void {
		if (this._connectionState !== state) {
			this._connectionState = state;
			this._onDidChangeConnectionState.fire(state);
			this._log(`Connection state changed to: ${state}`);
		}
	}

	/**
	 * Conecta ao servidor WebSocket
	 * Por padrão, tenta conectar ao servidor local que serve o frontend
	 */
	async connect(url?: string): Promise<void> {
		if (this._connectionState === ConnectionState.Connected || this._connectionState === ConnectionState.Connecting) {
			return;
		}

		const wsUrl = url || this._getDefaultWebSocketUrl();
		this._setConnectionState(ConnectionState.Connecting);

		try {
			this._log(`Connecting to ${wsUrl}...`);
			this._socket = new WebSocket(wsUrl);

			this._socket.onopen = () => {
				this._setConnectionState(ConnectionState.Connected);
				this._reconnectAttempts = 0;
				this._log('WebSocket connected');
			};

			this._socket.onclose = (event) => {
				this._log(`WebSocket closed: ${event.code} ${event.reason}`);
				this._setConnectionState(ConnectionState.Disconnected);
				this._handleReconnect(wsUrl);
			};

			this._socket.onerror = (error) => {
				this._log(`WebSocket error: ${JSON.stringify(error)}`);
				this._setConnectionState(ConnectionState.Error);
			};

			this._socket.onmessage = (event) => {
				try {
					const message = JSON.parse(event.data);
					this._handleMessage(message);
				} catch (e) {
					this._log(`Error parsing message: ${e}`);
				}
			};

		} catch (error) {
			this._log(`Error creating WebSocket: ${error}`);
			this._setConnectionState(ConnectionState.Error);
			this._handleReconnect(wsUrl);
		}
	}

	/**
	 * Desconecta do servidor
	 */
	disconnect(): void {
		if (this._reconnectTimeout) {
			clearTimeout(this._reconnectTimeout);
			this._reconnectTimeout = null;
		}

		if (this._socket) {
			this._socket.close();
			this._socket = null;
		}

		this._setConnectionState(ConnectionState.Disconnected);
	}

	/**
	 * Envia uma mensagem para o servidor
	 */
	sendMessage(type: string, payload: any): void {
		if (this._socket && this._socket.readyState === WebSocket.OPEN) {
			const message = JSON.stringify({
				type,
				timestamp: new Date().toISOString(),
				payload
			});
			this._socket.send(message);
		}
	}

	private _getDefaultWebSocketUrl(): string {
		// Detecta se está rodando em ambiente dev ou prod
		// Em um ambiente real, isso viria de configurações
		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const host = window.location.host;
		return `${protocol}//${host}/api/void/realtime`;
	}

	private _handleReconnect(url: string): void {
		if (this._reconnectAttempts < this._maxReconnectAttempts) {
			this._reconnectAttempts++;
			this._setConnectionState(ConnectionState.Reconnecting);
			const delay = this._reconnectDelay * Math.pow(1.5, this._reconnectAttempts - 1);
			this._log(`Reconnecting in ${delay}ms (attempt ${this._reconnectAttempts}/${this._maxReconnectAttempts})...`);

			this._reconnectTimeout = setTimeout(() => {
				this.connect(url);
			}, delay);
		} else {
			this._log('Max reconnect attempts reached');
			this._setConnectionState(ConnectionState.Disconnected);
		}
	}

	private _handleMessage(message: any): void {
		// Handle incoming messages (commands from frontend/backend)
		this._log(`Received message: ${message.type}`);

		// Emitir evento para que outros serviços possam processar
		this._onDidReceiveExternalMessage.fire(message);
	}

	private readonly _onDidReceiveExternalMessage = this._register(new Emitter<any>());
	readonly onDidReceiveExternalMessage: Event<any> = this._onDidReceiveExternalMessage.event;

	private _log(message: string): void {
		console.log(`[RealtimeCommService] ${message}`);
	}
}

// Register the service
registerSingleton(IRealtimeCommService, RealtimeCommService, InstantiationType.Delayed);
