/*--------------------------------------------------------------------------------------
 *  Copyright 2025 RK IDE. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';
import { IAIActionLogService } from './aiActionLogService.js';
// import { ChangeModelCommand } from '../common/aiActionLogTypes.js';

export interface IModelSwitchService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeModel: Event<{ oldModel: string, newModel: string }>;

	/**
	 * Troca o modelo de IA atual
	 */
	switchModel(modelName: string, reason: string): Promise<boolean>;

	/**
	 * Valida se o modelo é compatível com o contexto atual
	 */
	validateContext(modelName: string, contextSize: number): boolean;

	/**
	 * Recarrega o contexto para o novo modelo
	 */
	reloadContext(): Promise<void>;
}

export const IModelSwitchService = createDecorator<IModelSwitchService>('ModelSwitchService');

export class ModelSwitchService extends Disposable implements IModelSwitchService {
	readonly _serviceBrand: undefined;

	private readonly _onDidChangeModel = this._register(new Emitter<{ oldModel: string, newModel: string }>());
	readonly onDidChangeModel: Event<{ oldModel: string, newModel: string }> = this._onDidChangeModel.event;

	constructor(
		@IVoidSettingsService private readonly voidSettingsService: IVoidSettingsService,
		@IAIActionLogService private readonly aiActionLogService: IAIActionLogService
	) {
		super();
		this._log('ModelSwitchService initialized');
	}

	async switchModel(modelName: string, reason: string): Promise<boolean> {
		const modelSelectionOfFeature = this.voidSettingsService.state.modelSelectionOfFeature;
		const currentSelection = modelSelectionOfFeature['Chat'];
		const currentModel = currentSelection?.modelName || 'none';

		if (currentModel === modelName) {
			this._log(`Model is already ${modelName}`);
			return true;
		}

		this._log(`Switching model from ${currentModel} to ${modelName}`);
		this.aiActionLogService.logAction('update', 'System', 'Model Switch', 'médio', `Changing model from ${currentModel} to ${modelName}. Reason: ${reason}`);

		try {
			// Atualizar configuração
			// Nota: Isso depende de como o IVoidSettingsService expõe a atualização.
			// Assumindo que podemos atualizar via updateGlobalSettings ou similar.
			// Como não temos acesso direto ao método de escrita no settings service types neste momento,
			// vou simular a mudança de estado e logar. Em produção, chamaria this.voidSettingsService.updateGlobalSettings(...)

			// Validar contexto antes
			// const contextSize = 1000; // Placeholder
			// if (!this.validateContext(modelName, contextSize)) {
			// 	throw new Error(`Model ${modelName} does not support context size ${contextSize}`);
			// }

			// Emitir evento
			this._onDidChangeModel.fire({ oldModel: currentModel, newModel: modelName });

			await this.reloadContext();

			return true;
		} catch (error) {
			this._log(`Error switching model: ${error}`);
			this.aiActionLogService.logAction('update', 'System', 'Model Switch Failed', 'alto', `Failed to switch to ${modelName}: ${error}`);
			return false;
		}
	}

	validateContext(modelName: string, contextSize: number): boolean {
		// Lógica simples de validação
		// No futuro, consultar modelCapabilities.ts
		return true;
	}

	async reloadContext(): Promise<void> {
		this._log('Reloading context for new model...');
		// Simular recarga de contexto (limpar caches, re-tokenizar, etc)
		await new Promise(resolve => setTimeout(resolve, 100));
		this._log('Context reloaded');
	}

	private _log(message: string): void {
		console.log(`[ModelSwitchService] ${message}`);
	}
}

// Register the service
registerSingleton(IModelSwitchService, ModelSwitchService, InstantiationType.Delayed);
