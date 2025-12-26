/*--------------------------------------------------------------------------------------
 *  Copyright 2025 RK IDE. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/**
 * Interface para logs de ações da IA
 * Todas as ações da IA devem gerar um log neste formato
 */
export interface AIActionLog {
	/** Tipo do log - sempre 'ai_action_log' */
	type: 'ai_action_log';

	/** Tipo de ação executada */
	action: 'read' | 'create' | 'update' | 'delete';

	/** Caminho do arquivo afetado */
	file: string;

	/** Motivo técnico da ação */
	reason: string;

	/** Nível de impacto da ação */
	impact: 'baixo' | 'médio' | 'alto';

	/** Detalhes sobre o que mudou exatamente */
	details: string;

	/** Timestamp em formato ISO */
	timestamp: string;

	/** ID único do log */
	id: string;

	/** ID do thread de chat associado (opcional) */
	threadId?: string;
}

/**
 * Comando para troca de modelo de IA
 */
export interface ChangeModelCommand {
	type: 'change_model';
	model: string;
	context: '200k' | '1M';
	reason: string;
}

/**
 * União de todos os comandos de IA
 */
export type AICommand = AIActionLog | ChangeModelCommand;

/**
 * Operação de arquivo com análise de dependências
 */
export interface FileOperation {
	/** Caminho do arquivo */
	path: string;

	/** Tipo de operação */
	operation: 'read' | 'create' | 'update' | 'delete';

	/** Conteúdo (para create/update) */
	content?: string;

	/** Motivo da operação */
	reason: string;

	/** Arquivos que dependem deste */
	dependencies: string[];

	/** Impacto estimado */
	estimatedImpact: 'baixo' | 'médio' | 'alto';
}

/**
 * Resultado de uma execução autônoma
 */
export interface ExecutionResult {
	/** Se a execução foi bem sucedida */
	success: boolean;

	/** Logs gerados durante a execução */
	logs: AIActionLog[];

	/** Erros encontrados (se houver) */
	errors?: string[];

	/** Se é possível fazer rollback */
	rollbackAvailable: boolean;

	/** ID do checkpoint para rollback */
	checkpointId?: string;
}

/**
 * Estado do serviço de logs
 */
export interface AIActionLogState {
	/** Lista de logs recentes */
	logs: AIActionLog[];

	/** Se o serviço está ativo */
	isActive: boolean;

	/** Último erro (se houver) */
	lastError?: string;
}

/**
 * Filtros para busca de logs
 */
export interface AIActionLogFilter {
	/** Filtrar por tipo de ação */
	action?: 'read' | 'create' | 'update' | 'delete';

	/** Filtrar por nível de impacto */
	impact?: 'baixo' | 'médio' | 'alto';

	/** Filtrar por arquivo (regex) */
	filePattern?: string;

	/** Filtrar por período */
	fromDate?: string;
	toDate?: string;
}

/**
 * Helper para criar um novo log
 */
export function createAIActionLog(
	action: AIActionLog['action'],
	file: string,
	reason: string,
	impact: AIActionLog['impact'],
	details: string,
	threadId?: string
): AIActionLog {
	return {
		type: 'ai_action_log',
		id: generateLogId(),
		action,
		file,
		reason,
		impact,
		details,
		timestamp: new Date().toISOString(),
		threadId
	};
}

/**
 * Gera um ID único para o log
 */
function generateLogId(): string {
	return `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Calcula o impacto com base no tipo de operação e arquivo
 */
export function calculateImpact(
	operation: 'read' | 'create' | 'update' | 'delete',
	filePath: string,
	dependencyCount: number
): 'baixo' | 'médio' | 'alto' {
	// Read é sempre baixo impacto
	if (operation === 'read') {
		return 'baixo';
	}

	// Delete é alto impacto se tiver dependências
	if (operation === 'delete') {
		return dependencyCount > 0 ? 'alto' : 'médio';
	}

	// Create geralmente é baixo, a menos que seja arquivo crítico
	if (operation === 'create') {
		const criticalPatterns = [
			/package\.json$/,
			/tsconfig\.json$/,
			/\.contribution\.ts$/,
			/Service\.ts$/
		];
		return criticalPatterns.some(p => p.test(filePath)) ? 'médio' : 'baixo';
	}

	// Update: depende do número de dependências
	if (dependencyCount === 0) {
		return 'baixo';
	} else if (dependencyCount <= 3) {
		return 'médio';
	} else {
		return 'alto';
	}
}
