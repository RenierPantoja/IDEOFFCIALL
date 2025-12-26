/*--------------------------------------------------------------------------------------
 *  Copyright 2025 RK IDE. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';

/**
 * Configuração do servidor API
 */
export interface IApiServerConfig {
	port: number;
	host?: string;
	enableCors?: boolean;
	corsOrigins?: string[];
}

/**
 * Status do servidor API
 */
export interface IApiServerStatus {
	isRunning: boolean;
	port: number;
	connectedClients: number;
}

/**
 * Interface do serviço de servidor API (electron-main)
 */
export interface IApiServerService {
	readonly _serviceBrand: undefined;

	/**
	 * Evento quando o servidor inicia
	 */
	readonly onDidStart: Event<number>;

	/**
	 * Evento quando o servidor para
	 */
	readonly onDidStop: Event<void>;

	/**
	 * Evento quando um cliente conecta via WebSocket
	 */
	readonly onDidClientConnect: Event<void>;

	/**
	 * Evento quando um cliente desconecta
	 */
	readonly onDidClientDisconnect: Event<void>;

	/**
	 * Inicia o servidor HTTP/WebSocket
	 */
	start(config: IApiServerConfig): Promise<void>;

	/**
	 * Para o servidor
	 */
	stop(): Promise<void>;

	/**
	 * Obtém o status do servidor
	 */
	getStatus(): Promise<IApiServerStatus>;

	/**
	 * Envia mensagem para todos os clientes WebSocket
	 */
	broadcast(type: string, payload: any): Promise<void>;
}

export const IApiServerService = createDecorator<IApiServerService>('apiServerService');

/**
 * Proxy do serviço de servidor API para uso no browser
 * Comunica com o electron-main via IPC
 */
export class ApiServerServiceProxy implements IApiServerService {
	readonly _serviceBrand: undefined;

	private readonly apiServerService: IApiServerService;

	readonly onDidStart: Event<number>;
	readonly onDidStop: Event<void>;
	readonly onDidClientConnect: Event<void>;
	readonly onDidClientDisconnect: Event<void>;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService
	) {
		// Cria um proxy IPC para usar o ApiServerMainService no electron-main
		this.apiServerService = ProxyChannel.toService<IApiServerService>(
			mainProcessService.getChannel('void-channel-apiserver')
		);

		this.onDidStart = this.apiServerService.onDidStart;
		this.onDidStop = this.apiServerService.onDidStop;
		this.onDidClientConnect = this.apiServerService.onDidClientConnect;
		this.onDidClientDisconnect = this.apiServerService.onDidClientDisconnect;
	}

	start(config: IApiServerConfig): Promise<void> {
		return this.apiServerService.start(config);
	}

	stop(): Promise<void> {
		return this.apiServerService.stop();
	}

	getStatus(): Promise<IApiServerStatus> {
		return this.apiServerService.getStatus();
	}

	broadcast(type: string, payload: any): Promise<void> {
		return this.apiServerService.broadcast(type, payload);
	}
}

// Registrar o proxy no browser
registerSingleton(IApiServerService, ApiServerServiceProxy, InstantiationType.Delayed);
