/*--------------------------------------------------------------------------------------
 *  Copyright 2025 RK IDE. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/**
 * Interface para tarefas assíncronas
 */
export interface AsyncTask {
	id: string;
	title: string;
	description: string;
	status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
	priority: 'low' | 'medium' | 'high';

	/** Timestamp de criação */
	createdAt: string;

	/** Timestamp de início da execução */
	startedAt?: string;

	/** Timestamp de conclusão */
	completedAt?: string;

	/** Erro, se houver */
	error?: string;

	/** Progresso (0-100) */
	progress: number;

	/** Tipo da tarefa */
	type: string;

	/** Payload da tarefa (argumentos) */
	payload: any;

	/** Resultados da tarefa */
	result?: any;
}

/**
 * Evento de mudança de estado de tarefa
 */
export interface TaskStateChangeEvent {
	taskId: string;
	oldStatus: AsyncTask['status'];
	newStatus: AsyncTask['status'];
}
