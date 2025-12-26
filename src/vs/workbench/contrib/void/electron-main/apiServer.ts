/*--------------------------------------------------------------------------------------
 *  Copyright 2025 RK IDE. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import * as http from 'http';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IApiServerService, IApiServerConfig, IApiServerStatus } from '../common/apiServerService.js';

/**
 * Tipos de requisição da API
 */
interface ApiRequest {
	method: string;
	path: string;
	query: Record<string, string>;
	body: unknown;
	headers: Record<string, string | string[] | undefined>;
	params: Record<string, string>;
}

/**
 * Handler de rota
 */
type RouteHandler = (req: ApiRequest) => Promise<unknown>;

/**
 * Servidor HTTP para API do RK IDE
 *
 * Este servidor roda no processo principal do Electron e expõe
 * endpoints REST para comunicação externa.
 */
export class ApiServerMainService extends Disposable implements IApiServerService {
	readonly _serviceBrand: undefined;

	private _server: http.Server | null = null;
	private _routes: Map<string, Map<string, RouteHandler>> = new Map();
	private _isRunning = false;
	private _port = 23119;
	private _config: IApiServerConfig | null = null;
	private _connectedClients = 0;

	private readonly _onDidStart = this._register(new Emitter<number>());
	readonly onDidStart: Event<number> = this._onDidStart.event;

	private readonly _onDidStop = this._register(new Emitter<void>());
	readonly onDidStop: Event<void> = this._onDidStop.event;

	private readonly _onDidClientConnect = this._register(new Emitter<void>());
	readonly onDidClientConnect: Event<void> = this._onDidClientConnect.event;

	private readonly _onDidClientDisconnect = this._register(new Emitter<void>());
	readonly onDidClientDisconnect: Event<void> = this._onDidClientDisconnect.event;

	private readonly _onDidReceiveMessage = this._register(new Emitter<{ type: string; payload: unknown }>());
	readonly onDidReceiveMessage: Event<{ type: string; payload: unknown }> = this._onDidReceiveMessage.event;

	constructor() {
		super();
		this._setupDefaultRoutes();
		console.log('[ApiServerMainService] Initialized');
	}

	get isRunning(): boolean {
		return this._isRunning;
	}

	get port(): number {
		return this._port;
	}

	get connectedClients(): number {
		return this._connectedClients;
	}

	/**
	 * Inicia o servidor
	 */
	async start(config: IApiServerConfig): Promise<void> {
		if (this._isRunning) {
			console.log('[ApiServerMainService] Server is already running');
			return;
		}

		this._config = config;
		this._port = config.port;
		const host = config.host || '0.0.0.0';

		return new Promise((resolve, reject) => {
			try {
				// Criar servidor HTTP
				this._server = http.createServer((req, res) => {
					this._handleHttpRequest(req, res);
				});

				this._server.on('error', (error: Error & { code?: string }) => {
					if (error.code === 'EADDRINUSE') {
						console.error(`[ApiServerMainService] Port ${this._port} is already in use`);
						reject(new Error(`Port ${this._port} is already in use`));
					} else {
						console.error(`[ApiServerMainService] Server error: ${error}`);
						reject(error);
					}
				});

				this._server.listen(this._port, host, () => {
					this._isRunning = true;
					console.log(`[ApiServerMainService] Server started on http://${host}:${this._port}`);
					this._onDidStart.fire(this._port);
					resolve();
				});
			} catch (error) {
				reject(error);
			}
		});
	}

	/**
	 * Para o servidor
	 */
	async stop(): Promise<void> {
		if (!this._isRunning) {
			return;
		}

		return new Promise((resolve) => {
			// Fechar HTTP server
			if (this._server) {
				this._server.close(() => {
					this._isRunning = false;
					console.log('[ApiServerMainService] Server stopped');
					this._onDidStop.fire();
					resolve();
				});
				this._server = null;
			} else {
				this._isRunning = false;
				this._onDidStop.fire();
				resolve();
			}
		});
	}

	/**
	 * Obtém o status do servidor
	 */
	async getStatus(): Promise<IApiServerStatus> {
		return {
			isRunning: this._isRunning,
			port: this._port,
			connectedClients: this._connectedClients
		};
	}

	/**
	 * Registra uma rota
	 */
	registerRoute(method: string, path: string, handler: RouteHandler): void {
		const methodUpper = method.toUpperCase();
		if (!this._routes.has(methodUpper)) {
			this._routes.set(methodUpper, new Map());
		}
		this._routes.get(methodUpper)!.set(path, handler);
	}

	/**
	 * Envia mensagem para todos os clientes (placeholder para WebSocket futuro)
	 */
	async broadcast(_type: string, _payload: unknown): Promise<void> {
		// WebSocket broadcast será implementado posteriormente
		console.log('[ApiServerMainService] Broadcast called (WebSocket not yet implemented)');
	}

	/**
	 * Configura rotas padrão
	 */
	private _setupDefaultRoutes(): void {
		// Health check
		this.registerRoute('GET', '/health', async () => ({
			status: 'ok',
			timestamp: new Date().toISOString()
		}));

		// Info
		this.registerRoute('GET', '/info', async () => ({
			name: 'RK IDE API',
			version: '1.0.0',
			endpoints: {
				rest: [
					'GET /health',
					'GET /info',
					'GET /api/void/status',
					'GET /api/void/logs',
					'GET /api/void/chat/history',
					'GET /api/void/chat/thread/:id',
					'POST /api/void/chat/send',
					'POST /api/void/model/change',
					'POST /api/void/file/operation'
				]
			}
		}));
	}

	/**
	 * Processa requisição HTTP
	 */
	private async _handleHttpRequest(
		req: http.IncomingMessage,
		res: http.ServerResponse
	): Promise<void> {
		const config = this._config;

		// CORS headers
		if (!config || config.enableCors !== false) {
			const origin = req.headers.origin || '*';
			const allowedOrigins = config?.corsOrigins || ['*'];

			if (allowedOrigins.includes('*') || (typeof origin === 'string' && allowedOrigins.includes(origin))) {
				res.setHeader('Access-Control-Allow-Origin', origin);
			}
			res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
			res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
			res.setHeader('Access-Control-Allow-Credentials', 'true');
		}

		// Handle preflight
		if (req.method === 'OPTIONS') {
			res.writeHead(204);
			res.end();
			return;
		}

		try {
			const url = new URL(req.url || '/', `http://${req.headers.host}`);
			const method = req.method || 'GET';
			const path = url.pathname;
			const query: Record<string, string> = {};

			url.searchParams.forEach((value, key) => {
				query[key] = value;
			});

			// Parse body for POST/PUT
			let body: unknown = null;
			if (method === 'POST' || method === 'PUT') {
				body = await this._parseBody(req);
			}

			const apiRequest: ApiRequest = {
				method,
				path,
				query,
				body,
				headers: req.headers as Record<string, string | string[] | undefined>,
				params: {}
			};

			// Find route handler
			const { handler, params } = this._findRouteHandler(method, path);
			apiRequest.params = params;

			if (handler) {
				const result = await handler(apiRequest);
				this._sendJsonResponse(res, 200, {
					success: true,
					data: result,
					timestamp: new Date().toISOString()
				});
			} else {
				this._sendJsonResponse(res, 404, {
					success: false,
					error: `Route not found: ${method} ${path}`,
					timestamp: new Date().toISOString()
				});
			}
		} catch (error) {
			console.error('[ApiServerMainService] Request error:', error);
			this._sendJsonResponse(res, 500, {
				success: false,
				error: error instanceof Error ? error.message : 'Internal server error',
				timestamp: new Date().toISOString()
			});
		}
	}

	/**
	 * Encontra handler de rota
	 */
	private _findRouteHandler(method: string, path: string): { handler: RouteHandler | null; params: Record<string, string> } {
		const methodRoutes = this._routes.get(method.toUpperCase());
		if (!methodRoutes) {
			return { handler: null, params: {} };
		}

		// Exact match
		if (methodRoutes.has(path)) {
			return { handler: methodRoutes.get(path)!, params: {} };
		}

		// Pattern match (simple :param support)
		for (const [routePath, handler] of methodRoutes) {
			const { matches, params } = this._matchRoute(routePath, path);
			if (matches) {
				return { handler, params };
			}
		}

		return { handler: null, params: {} };
	}

	/**
	 * Verifica se path corresponde ao padrão da rota
	 */
	private _matchRoute(pattern: string, path: string): { matches: boolean; params: Record<string, string> } {
		const patternParts = pattern.split('/');
		const pathParts = path.split('/');
		const params: Record<string, string> = {};

		if (patternParts.length !== pathParts.length) {
			return { matches: false, params: {} };
		}

		for (let i = 0; i < patternParts.length; i++) {
			if (patternParts[i].startsWith(':')) {
				const paramName = patternParts[i].slice(1);
				params[paramName] = pathParts[i];
				continue;
			}
			if (patternParts[i] !== pathParts[i]) {
				return { matches: false, params: {} };
			}
		}

		return { matches: true, params };
	}

	/**
	 * Parse body da requisição
	 */
	private _parseBody(req: http.IncomingMessage): Promise<unknown> {
		return new Promise((resolve, reject) => {
			let body = '';
			req.on('data', (chunk: string | Buffer) => {
				body += chunk.toString();
			});
			req.on('end', () => {
				try {
					resolve(body ? JSON.parse(body) : null);
				} catch {
					resolve(body);
				}
			});
			req.on('error', reject);
		});
	}

	/**
	 * Envia resposta JSON
	 */
	private _sendJsonResponse(res: http.ServerResponse, statusCode: number, data: unknown): void {
		res.writeHead(statusCode, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(data));
	}

	override dispose(): void {
		this.stop();
		super.dispose();
	}
}
