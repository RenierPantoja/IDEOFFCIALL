/*--------------------------------------------------------------------------------------
 *  Copyright 2025 RK IDE. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ISearchService } from '../../../services/search/common/search.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { AIActionLog, ExecutionResult, FileOperation, calculateImpact } from '../common/aiActionLogTypes.js';
import { IAIActionLogService } from './aiActionLogService.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { QueryBuilder } from '../../../services/search/common/queryBuilder.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { VSBuffer } from '../../../../base/common/buffer.js';

/**
 * Checkpoint de arquivo para rollback
 */
export interface FileCheckpoint {
	id: string;
	filePath: string;
	originalContent: string;
	timestamp: string;
	operation: 'create' | 'update' | 'delete';
}

/**
 * Resultado da análise de dependências
 */
export interface DependencyAnalysis {
	/** Arquivos que importam este arquivo */
	importedBy: string[];
	/** Arquivos que este arquivo importa */
	imports: string[];
	/** Contagem total de dependências */
	dependencyCount: number;
}

/**
 * Interface do serviço de arquivos autônomo
 */
export interface IAutonomousFileService {
	readonly _serviceBrand: undefined;

	/**
	 * Evento disparado quando uma operação é executada
	 */
	readonly onDidExecuteOperation: Event<FileOperation>;

	/**
	 * Lê um arquivo e analisa suas dependências
	 */
	readFile(path: string): Promise<{ content: string; dependencies: DependencyAnalysis }>;

	/**
	 * Cria um arquivo com logging automático
	 */
	createFile(path: string, content: string, reason: string, threadId?: string): Promise<ExecutionResult>;

	/**
	 * Atualiza um arquivo com checkpoint automático
	 */
	updateFile(path: string, newContent: string, reason: string, threadId?: string): Promise<ExecutionResult>;

	/**
	 * Deleta um arquivo com verificação de dependências
	 */
	deleteFile(path: string, reason: string, threadId?: string): Promise<ExecutionResult>;

	/**
	 * Analisa o impacto de uma operação
	 */
	analyzeImpact(path: string, operation: 'read' | 'create' | 'update' | 'delete'): Promise<'baixo' | 'médio' | 'alto'>;

	/**
	 * Obtém as dependências de um arquivo
	 */
	getDependencies(path: string): Promise<DependencyAnalysis>;

	/**
	 * Cria um checkpoint manual
	 */
	createCheckpoint(filePath: string): Promise<string>;

	/**
	 * Faz rollback para um checkpoint
	 */
	rollback(checkpointId: string): Promise<boolean>;

	/**
	 * Obtém todos os checkpoints ativos
	 */
	getCheckpoints(): FileCheckpoint[];

	/**
	 * Limpa checkpoints antigos
	 */
	cleanupCheckpoints(olderThanMs?: number): void;
}

export const IAutonomousFileService = createDecorator<IAutonomousFileService>('AutonomousFileService');

// Limite de checkpoints em memória
const MAX_CHECKPOINTS = 100;
// Tempo máximo de retenção de checkpoints (1 hora)
const CHECKPOINT_RETENTION_MS = 60 * 60 * 1000;

/**
 * Implementação do serviço de arquivos autônomo
 *
 * Este serviço é responsável por:
 * - Executar operações de arquivo de forma autônoma
 * - Analisar dependências antes de alterações
 * - Criar checkpoints para rollback
 * - Calcular impacto das operações
 * - Logar todas as ações automaticamente
 */
export class AutonomousFileService extends Disposable implements IAutonomousFileService {
	readonly _serviceBrand: undefined;

	private readonly _checkpoints: Map<string, FileCheckpoint> = new Map();
	private readonly _queryBuilder: QueryBuilder;

	private readonly _onDidExecuteOperation = this._register(new Emitter<FileOperation>());
	readonly onDidExecuteOperation: Event<FileOperation> = this._onDidExecuteOperation.event;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@ISearchService private readonly searchService: ISearchService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IAIActionLogService private readonly aiActionLogService: IAIActionLogService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._queryBuilder = instantiationService.createInstance(QueryBuilder);
		this._log('AutonomousFileService initialized');

		// Cleanup automático a cada 10 minutos
		const cleanupInterval = setInterval(() => {
			this.cleanupCheckpoints();
		}, 10 * 60 * 1000);

		this._register({
			dispose: () => clearInterval(cleanupInterval)
		});
	}

	/**
	 * Lê um arquivo e analisa suas dependências
	 */
	async readFile(path: string): Promise<{ content: string; dependencies: DependencyAnalysis }> {
		const uri = URI.file(path);

		// Log the read action
		this.aiActionLogService.logAction('read', path, 'Leitura de arquivo para análise', 'baixo', 'Lendo conteúdo e dependências');

		try {
			const content = await this.fileService.readFile(uri);
			const contentStr = content.value.toString();

			const dependencies = await this.getDependencies(path);

			return { content: contentStr, dependencies };
		} catch (error) {
			throw new Error(`Erro ao ler arquivo ${path}: ${error}`);
		}
	}

	/**
	 * Cria um arquivo com logging automático
	 */
	async createFile(path: string, content: string, reason: string, threadId?: string): Promise<ExecutionResult> {
		const uri = URI.file(path);
		const logs: AIActionLog[] = [];

		try {
			// Verificar se arquivo já existe
			const exists = await this.fileService.exists(uri);
			if (exists) {
				throw new Error(`Arquivo ${path} já existe. Use updateFile para modificar.`);
			}

			// Calcular impacto
			const impact = await this.analyzeImpact(path, 'create');

			// Criar arquivo
			await this.fileService.writeFile(uri, VSBuffer.fromString(content));

			// Log da ação
			const log = this.aiActionLogService.logAction(
				'create',
				path,
				reason,
				impact,
				`Arquivo criado com ${content.length} caracteres`,
				threadId
			);
			logs.push(log);

			// Emitir evento
			this._onDidExecuteOperation.fire({
				path,
				operation: 'create',
				content,
				reason,
				dependencies: [],
				estimatedImpact: impact
			});

			return {
				success: true,
				logs,
				rollbackAvailable: false // Não há conteúdo anterior para rollback
			};
		} catch (error) {
			return {
				success: false,
				logs,
				errors: [(error as Error).message],
				rollbackAvailable: false
			};
		}
	}

	/**
	 * Atualiza um arquivo com checkpoint automático
	 */
	async updateFile(path: string, newContent: string, reason: string, threadId?: string): Promise<ExecutionResult> {
		const uri = URI.file(path);
		const logs: AIActionLog[] = [];
		let checkpointId: string | undefined;

		try {
			// Verificar se arquivo existe
			const exists = await this.fileService.exists(uri);
			if (!exists) {
				throw new Error(`Arquivo ${path} não existe. Use createFile para criar.`);
			}

			// Criar checkpoint antes da alteração
			checkpointId = await this.createCheckpoint(path);

			// Analisar dependências e calcular impacto
			const dependencies = await this.getDependencies(path);
			const impact = calculateImpact('update', path, dependencies.dependencyCount);

			// Atualizar arquivo
			await this.fileService.writeFile(uri, VSBuffer.fromString(newContent));

			// Log da ação
			const log = this.aiActionLogService.logAction(
				'update',
				path,
				reason,
				impact,
				`Arquivo atualizado. ${dependencies.dependencyCount} dependência(s) encontrada(s). Checkpoint: ${checkpointId}`,
				threadId
			);
			logs.push(log);

			// Emitir evento
			this._onDidExecuteOperation.fire({
				path,
				operation: 'update',
				content: newContent,
				reason,
				dependencies: dependencies.importedBy,
				estimatedImpact: impact
			});

			return {
				success: true,
				logs,
				rollbackAvailable: true,
				checkpointId
			};
		} catch (error) {
			// Se falhou mas temos checkpoint, podemos fazer rollback
			if (checkpointId) {
				await this.rollback(checkpointId);
			}

			return {
				success: false,
				logs,
				errors: [(error as Error).message],
				rollbackAvailable: !!checkpointId,
				checkpointId
			};
		}
	}

	/**
	 * Deleta um arquivo com verificação de dependências
	 */
	async deleteFile(path: string, reason: string, threadId?: string): Promise<ExecutionResult> {
		const uri = URI.file(path);
		const logs: AIActionLog[] = [];
		let checkpointId: string | undefined;

		try {
			// Verificar se arquivo existe
			const exists = await this.fileService.exists(uri);
			if (!exists) {
				throw new Error(`Arquivo ${path} não existe.`);
			}

			// Analisar dependências
			const dependencies = await this.getDependencies(path);

			// Se tem dependências, avisar no log mas continuar
			if (dependencies.importedBy.length > 0) {
				this._log(`AVISO: Arquivo ${path} é importado por ${dependencies.importedBy.length} arquivo(s)`);
			}

			// Calcular impacto
			const impact = calculateImpact('delete', path, dependencies.dependencyCount);

			// Criar checkpoint antes de deletar
			checkpointId = await this.createCheckpoint(path);

			// Deletar arquivo
			await this.fileService.del(uri);

			// Log da ação
			const log = this.aiActionLogService.logAction(
				'delete',
				path,
				reason,
				impact,
				`Arquivo deletado. Era importado por ${dependencies.importedBy.length} arquivo(s). Checkpoint: ${checkpointId}`,
				threadId
			);
			logs.push(log);

			// Emitir evento
			this._onDidExecuteOperation.fire({
				path,
				operation: 'delete',
				reason,
				dependencies: dependencies.importedBy,
				estimatedImpact: impact
			});

			return {
				success: true,
				logs,
				rollbackAvailable: true,
				checkpointId
			};
		} catch (error) {
			return {
				success: false,
				logs,
				errors: [(error as Error).message],
				rollbackAvailable: !!checkpointId,
				checkpointId
			};
		}
	}

	/**
	 * Analisa o impacto de uma operação
	 */
	async analyzeImpact(path: string, operation: 'read' | 'create' | 'update' | 'delete'): Promise<'baixo' | 'médio' | 'alto'> {
		if (operation === 'read') {
			return 'baixo';
		}

		const dependencies = await this.getDependencies(path);
		return calculateImpact(operation, path, dependencies.dependencyCount);
	}

	/**
	 * Obtém as dependências de um arquivo
	 */
	async getDependencies(path: string): Promise<DependencyAnalysis> {
		const uri = URI.file(path);
		const importedBy: string[] = [];
		const imports: string[] = [];

		try {
			// Extrair o nome do arquivo para buscar quem o importa
			const fileName = path.split(/[/\\]/).pop() || '';
			const fileNameWithoutExtension = fileName.replace(/\.[^/.]+$/, '');

			// Buscar arquivos que importam este arquivo
			const workspaceFolders = this.workspaceContextService.getWorkspace().folders.map(f => f.uri);

			if (workspaceFolders.length > 0) {
				// Buscar por padrões de import
				const importPatterns = [
					`from.*['"].*${fileNameWithoutExtension}['"]`,
					`import.*['"].*${fileNameWithoutExtension}['"]`,
					`require\\(['"].*${fileNameWithoutExtension}['"]\\)`
				];

				for (const pattern of importPatterns) {
					try {
						const query = this._queryBuilder.text({
							pattern,
							isRegExp: true
						}, workspaceFolders);

						const results = await this.searchService.textSearch(query, CancellationToken.None);

						for (const result of results.results) {
							const resultPath = result.resource.fsPath;
							// Não incluir o próprio arquivo
							if (resultPath !== path && !importedBy.includes(resultPath)) {
								importedBy.push(resultPath);
							}
						}
					} catch {
						// Continuar mesmo se uma busca falhar
					}
				}
			}

			// Ler o arquivo atual e extrair seus imports
			const exists = await this.fileService.exists(uri);
			if (exists) {
				const content = await this.fileService.readFile(uri);
				const contentStr = content.value.toString();

				// Regex para encontrar imports
				const importRegex = /(?:import|from)\s+['"]([^'"]+)['"]/g;
				const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

				let match;
				while ((match = importRegex.exec(contentStr)) !== null) {
					if (!imports.includes(match[1])) {
						imports.push(match[1]);
					}
				}
				while ((match = requireRegex.exec(contentStr)) !== null) {
					if (!imports.includes(match[1])) {
						imports.push(match[1]);
					}
				}
			}
		} catch (error) {
			this._log(`Erro ao analisar dependências de ${path}: ${error}`);
		}

		return {
			importedBy,
			imports,
			dependencyCount: importedBy.length + imports.length
		};
	}

	/**
	 * Cria um checkpoint para um arquivo
	 */
	async createCheckpoint(filePath: string): Promise<string> {
		const uri = URI.file(filePath);
		const checkpointId = `checkpoint_${generateUuid()}`;

		try {
			const exists = await this.fileService.exists(uri);
			let originalContent = '';

			if (exists) {
				const content = await this.fileService.readFile(uri);
				originalContent = content.value.toString();
			}

			const checkpoint: FileCheckpoint = {
				id: checkpointId,
				filePath,
				originalContent,
				timestamp: new Date().toISOString(),
				operation: exists ? 'update' : 'create'
			};

			this._checkpoints.set(checkpointId, checkpoint);

			// Limitar número de checkpoints
			if (this._checkpoints.size > MAX_CHECKPOINTS) {
				const oldestKey = this._checkpoints.keys().next().value;
				if (oldestKey) {
					this._checkpoints.delete(oldestKey);
				}
			}

			this._log(`Checkpoint criado: ${checkpointId} para ${filePath}`);
			return checkpointId;
		} catch (error) {
			throw new Error(`Erro ao criar checkpoint para ${filePath}: ${error}`);
		}
	}

	/**
	 * Faz rollback para um checkpoint
	 */
	async rollback(checkpointId: string): Promise<boolean> {
		const checkpoint = this._checkpoints.get(checkpointId);

		if (!checkpoint) {
			this._log(`Checkpoint não encontrado: ${checkpointId}`);
			return false;
		}

		try {
			const uri = URI.file(checkpoint.filePath);

			if (checkpoint.operation === 'delete' || checkpoint.operation === 'update') {
				// Restaurar o conteúdo original
				await this.fileService.writeFile(uri, VSBuffer.fromString(checkpoint.originalContent));
			} else if (checkpoint.operation === 'create') {
				// Se foi uma criação, deletar o arquivo
				const exists = await this.fileService.exists(uri);
				if (exists) {
					await this.fileService.del(uri);
				}
			}

			// Log do rollback
			this.aiActionLogService.logAction(
				'update',
				checkpoint.filePath,
				'Rollback executado',
				'médio',
				`Arquivo restaurado para o estado do checkpoint ${checkpointId}`
			);

			// Remover checkpoint usado
			this._checkpoints.delete(checkpointId);

			this._log(`Rollback executado com sucesso: ${checkpointId}`);
			return true;
		} catch (error) {
			this._log(`Erro no rollback ${checkpointId}: ${error}`);
			return false;
		}
	}

	/**
	 * Obtém todos os checkpoints ativos
	 */
	getCheckpoints(): FileCheckpoint[] {
		return Array.from(this._checkpoints.values());
	}

	/**
	 * Limpa checkpoints antigos
	 */
	cleanupCheckpoints(olderThanMs: number = CHECKPOINT_RETENTION_MS): void {
		const now = Date.now();
		let removedCount = 0;

		for (const [id, checkpoint] of this._checkpoints.entries()) {
			const checkpointTime = new Date(checkpoint.timestamp).getTime();
			if (now - checkpointTime > olderThanMs) {
				this._checkpoints.delete(id);
				removedCount++;
			}
		}

		if (removedCount > 0) {
			this._log(`Limpeza de checkpoints: ${removedCount} removido(s)`);
		}
	}

	/**
	 * Log interno para debugging
	 */
	private _log(message: string): void {
		console.log(`[AutonomousFileService] ${message}`);
	}
}

// Register the service
registerSingleton(IAutonomousFileService, AutonomousFileService, InstantiationType.Delayed);
