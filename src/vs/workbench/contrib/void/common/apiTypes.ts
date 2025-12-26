/*--------------------------------------------------------------------------------------
 *  Copyright 2025 RK IDE. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { AIActionLog } from './aiActionLogTypes.js';

/**
 * Tipos para a API HTTP do RK IDE
 * Permite comunicação externa com o IDE via REST API
 */

// ============================================
// Request Types
// ============================================

/**
 * Comando para enviar mensagem ao chat
 */
export interface SendMessageRequest {
	/** Mensagem a ser enviada */
	message: string;
	/** ID do thread (opcional, cria novo se não especificado) */
	threadId?: string;
	/** Contexto adicional (arquivos, seleção, etc) */
	context?: {
		files?: string[];
		selection?: string;
		cwd?: string;
	};
}

/**
 * Comando para trocar modelo de IA
 */
export interface ChangeModelRequest {
	/** Nome do modelo */
	modelName: string;
	/** Nome do provedor */
	providerName: string;
	/** Motivo da troca */
	reason?: string;
}

/**
 * Comando para executar operação de arquivo
 */
export interface FileOperationRequest {
	/** Tipo de operação */
	operation: 'read' | 'create' | 'update' | 'delete';
	/** Caminho do arquivo */
	path: string;
	/** Conteúdo (para create/update) */
	content?: string;
	/** Motivo da operação */
	reason?: string;
}

/**
 * Comando para executar comando no terminal
 */
export interface TerminalCommandRequest {
	/** Comando a executar */
	command: string;
	/** Diretório de trabalho */
	cwd?: string;
	/** Se deve usar terminal persistente */
	persistent?: boolean;
	/** ID do terminal persistente (se aplicável) */
	terminalId?: string;
}

/**
 * Filtros para busca de logs
 */
export interface LogsQueryRequest {
	/** Número máximo de logs */
	limit?: number;
	/** Filtrar por ação */
	action?: 'read' | 'create' | 'update' | 'delete';
	/** Filtrar por impacto */
	impact?: 'baixo' | 'médio' | 'alto';
	/** Filtrar por arquivo (regex) */
	filePattern?: string;
	/** Data inicial */
	fromDate?: string;
	/** Data final */
	toDate?: string;
}

// ============================================
// Response Types
// ============================================

/**
 * Resposta padrão da API
 */
export interface ApiResponse<T = any> {
	success: boolean;
	data?: T;
	error?: string;
	timestamp: string;
}

/**
 * Resposta de envio de mensagem
 */
export interface SendMessageResponse {
	/** ID do thread */
	threadId: string;
	/** ID da mensagem */
	messageId: string;
	/** Status */
	status: 'queued' | 'processing' | 'completed' | 'error';
}

/**
 * Resposta de troca de modelo
 */
export interface ChangeModelResponse {
	/** Modelo anterior */
	previousModel: string;
	/** Novo modelo */
	newModel: string;
	/** Se a troca foi bem sucedida */
	success: boolean;
}

/**
 * Resposta de operação de arquivo
 */
export interface FileOperationResponse {
	/** Se a operação foi bem sucedida */
	success: boolean;
	/** Caminho do arquivo */
	path: string;
	/** ID do checkpoint (para rollback) */
	checkpointId?: string;
	/** Conteúdo (para read) */
	content?: string;
}

/**
 * Resposta de logs
 */
export interface LogsResponse {
	logs: AIActionLog[];
	total: number;
	hasMore: boolean;
}

/**
 * Resposta de histórico do chat
 */
export interface ChatHistoryResponse {
	threads: {
		id: string;
		title: string;
		createdAt: string;
		updatedAt: string;
		messageCount: number;
	}[];
}

/**
 * Resposta de thread específico
 */
export interface ThreadResponse {
	id: string;
	title: string;
	messages: {
		id: string;
		role: 'user' | 'assistant' | 'system';
		content: string;
		timestamp: string;
	}[];
}

/**
 * Status do IDE
 */
export interface IDEStatusResponse {
	/** Se o IDE está conectado */
	connected: boolean;
	/** Modelo atual */
	currentModel: string;
	/** Provedor atual */
	currentProvider: string;
	/** Workspace aberto */
	workspace?: string;
	/** Número de logs */
	logsCount: number;
	/** Tarefas pendentes */
	pendingTasks: number;
}

// ============================================
// WebSocket Message Types
// ============================================

/**
 * Tipos de mensagens WebSocket
 */
export type WebSocketMessageType =
	| 'ai_action_log'
	| 'chat_message'
	| 'chat_response'
	| 'model_changed'
	| 'task_update'
	| 'error'
	| 'ping'
	| 'pong';

/**
 * Mensagem WebSocket genérica
 */
export interface WebSocketMessage<T = any> {
	type: WebSocketMessageType;
	timestamp: string;
	payload: T;
}

/**
 * Payload de mensagem de chat
 */
export interface ChatMessagePayload {
	threadId: string;
	messageId: string;
	role: 'user' | 'assistant';
	content: string;
	isStreaming?: boolean;
	isComplete?: boolean;
}

/**
 * Payload de atualização de tarefa
 */
export interface TaskUpdatePayload {
	taskId: string;
	status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
	progress?: number;
	result?: any;
	error?: string;
}
