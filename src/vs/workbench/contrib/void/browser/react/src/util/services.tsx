/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect, useCallback } from 'react'
import { MCPUserState, RefreshableProviderName, SettingsOfProvider } from '../../../../../../../workbench/contrib/void/common/voidSettingsTypes.js'
import { DisposableStore, IDisposable } from '../../../../../../../base/common/lifecycle.js'
import { VoidSettingsState } from '../../../../../../../workbench/contrib/void/common/voidSettingsService.js'
import { ColorScheme } from '../../../../../../../platform/theme/common/theme.js'
import { RefreshModelStateOfProvider } from '../../../../../../../workbench/contrib/void/common/refreshModelService.js'

import { ServicesAccessor } from '../../../../../../../editor/browser/editorExtensions.js';
import { IExplorerService } from '../../../../../../../workbench/contrib/files/browser/files.js'
import { IModelService } from '../../../../../../../editor/common/services/model.js';
import { IClipboardService } from '../../../../../../../platform/clipboard/common/clipboardService.js';
import { IContextViewService, IContextMenuService } from '../../../../../../../platform/contextview/browser/contextView.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { IThemeService } from '../../../../../../../platform/theme/common/themeService.js';
import { ILLMMessageService } from '../../../../common/sendLLMMessageService.js';
import { IRefreshModelService } from '../../../../../../../workbench/contrib/void/common/refreshModelService.js';
import { IVoidSettingsService } from '../../../../../../../workbench/contrib/void/common/voidSettingsService.js';
import { IExtensionTransferService } from '../../../../../../../workbench/contrib/void/browser/extensionTransferService.js'

import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js'
import { ICodeEditorService } from '../../../../../../../editor/browser/services/codeEditorService.js'
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js'
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js'
import { INotificationService } from '../../../../../../../platform/notification/common/notification.js'
import { IAccessibilityService } from '../../../../../../../platform/accessibility/common/accessibility.js'
import { ILanguageConfigurationService } from '../../../../../../../editor/common/languages/languageConfigurationRegistry.js'
import { ILanguageFeaturesService } from '../../../../../../../editor/common/services/languageFeatures.js'
import { ILanguageDetectionService } from '../../../../../../services/languageDetection/common/languageDetectionWorkerService.js'
import { IKeybindingService } from '../../../../../../../platform/keybinding/common/keybinding.js'
import { IEnvironmentService } from '../../../../../../../platform/environment/common/environment.js'
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js'
import { IPathService } from '../../../../../../../workbench/services/path/common/pathService.js'
import { IMetricsService } from '../../../../../../../workbench/contrib/void/common/metricsService.js'
import { URI } from '../../../../../../../base/common/uri.js'
import { IChatThreadService, ThreadsState, ThreadStreamState } from '../../../chatThreadService.js'
import { ITerminalToolService } from '../../../terminalToolService.js'
import { ILanguageService } from '../../../../../../../editor/common/languages/language.js'
import { IVoidModelService } from '../../../../common/voidModelService.js'
import { IWorkspaceContextService } from '../../../../../../../platform/workspace/common/workspace.js'
import { IVoidCommandBarService } from '../../../voidCommandBarService.js'
import { INativeHostService } from '../../../../../../../platform/native/common/native.js';
import { IEditCodeService } from '../../../editCodeServiceInterface.js'
import { IToolsService } from '../../../toolsService.js'
import { IConvertToLLMMessageService } from '../../../convertToLLMMessageService.js'
import { ITerminalService } from '../../../../../terminal/browser/terminal.js'
import { ISearchService } from '../../../../../../services/search/common/search.js'
import { IExtensionManagementService } from '../../../../../../../platform/extensionManagement/common/extensionManagement.js'
import { IMCPService } from '../../../../common/mcpService.js';
import { IStorageService, StorageScope } from '../../../../../../../platform/storage/common/storage.js'
import { OPT_OUT_KEY } from '../../../../common/storageKeys.js'
import { IAIActionLogService } from '../../../aiActionLogService.js';
import { IAsyncTaskQueueService } from '../../../asyncTaskQueueService.js';
import { AIActionLog, AIActionLogState } from '../../../../common/aiActionLogTypes.js';
import { IAutonomousFileService } from '../../../autonomousFileService.js';
import { IApiService } from '../../../apiService.js';
import { IApiServerService } from '../../../../common/apiServerService.js';
import { IFirebaseSyncService } from '../../../firebaseSyncService.js';
import { IFirebaseAuthService } from '../../../firebaseAuthService.js';
import { FirebaseAuthState } from '../../../../common/firebaseSyncTypes.js';


// normally to do this you'd use a useEffect that calls .onDidChangeState(), but useEffect mounts too late and misses initial state changes

// even if React hasn't mounted yet, the variables are always updated to the latest state.
// React listens by adding a setState function to these listeners.

let chatThreadsState: ThreadsState
const chatThreadsStateListeners: Set<(s: ThreadsState) => void> = new Set()

let chatThreadsStreamState: ThreadStreamState
const chatThreadsStreamStateListeners: Set<(threadId: string) => void> = new Set()

let settingsState: VoidSettingsState
const settingsStateListeners: Set<(s: VoidSettingsState) => void> = new Set()

let refreshModelState: RefreshModelStateOfProvider
const refreshModelStateListeners: Set<(s: RefreshModelStateOfProvider) => void> = new Set()
const refreshModelProviderListeners: Set<(p: RefreshableProviderName, s: RefreshModelStateOfProvider) => void> = new Set()

let colorThemeState: ColorScheme
const colorThemeStateListeners: Set<(s: ColorScheme) => void> = new Set()

const ctrlKZoneStreamingStateListeners: Set<(diffareaid: number, s: boolean) => void> = new Set()
const commandBarURIStateListeners: Set<(uri: URI) => void> = new Set();
const activeURIListeners: Set<(uri: URI | null) => void> = new Set();

const mcpListeners: Set<() => void> = new Set()

// AI Action Log State (RK IDE autonomous AI system)
let aiActionLogState: AIActionLogState
const aiActionLogStateListeners: Set<(s: AIActionLogState) => void> = new Set()
const aiActionLogListeners: Set<(log: AIActionLog) => void> = new Set()

// Firebase Auth State
let firebaseAuthState: FirebaseAuthState
const firebaseAuthStateListeners: Set<(s: FirebaseAuthState) => void> = new Set()


// must call this before you can use any of the hooks below
// this should only be called ONCE! this is the only place you don't need to dispose onDidChange. If you use state.onDidChange anywhere else, make sure to dispose it!
export const _registerServices = (accessor: ServicesAccessor) => {

	const disposables: IDisposable[] = []

	_registerAccessor(accessor)

	const stateServices = {
		chatThreadsStateService: accessor.get(IChatThreadService),
		settingsStateService: accessor.get(IVoidSettingsService),
		refreshModelService: accessor.get(IRefreshModelService),
		themeService: accessor.get(IThemeService),
		editCodeService: accessor.get(IEditCodeService),
		voidCommandBarService: accessor.get(IVoidCommandBarService),
		modelService: accessor.get(IModelService),
		mcpService: accessor.get(IMCPService),
		aiActionLogService: accessor.get(IAIActionLogService),
		firebaseAuthService: accessor.get(IFirebaseAuthService),
	}

	const { settingsStateService, chatThreadsStateService, refreshModelService, themeService, editCodeService, voidCommandBarService, modelService, mcpService, aiActionLogService, firebaseAuthService } = stateServices




	chatThreadsState = chatThreadsStateService.state
	disposables.push(
		chatThreadsStateService.onDidChangeCurrentThread(() => {
			chatThreadsState = chatThreadsStateService.state
			chatThreadsStateListeners.forEach(l => l(chatThreadsState))
		})
	)

	// same service, different state
	chatThreadsStreamState = chatThreadsStateService.streamState
	disposables.push(
		chatThreadsStateService.onDidChangeStreamState(({ threadId }) => {
			chatThreadsStreamState = chatThreadsStateService.streamState
			chatThreadsStreamStateListeners.forEach(l => l(threadId))
		})
	)

	settingsState = settingsStateService.state
	disposables.push(
		settingsStateService.onDidChangeState(() => {
			settingsState = settingsStateService.state
			settingsStateListeners.forEach(l => l(settingsState))
		})
	)

	refreshModelState = refreshModelService.state
	disposables.push(
		refreshModelService.onDidChangeState((providerName) => {
			refreshModelState = refreshModelService.state
			refreshModelStateListeners.forEach(l => l(refreshModelState))
			refreshModelProviderListeners.forEach(l => l(providerName, refreshModelState)) // no state
		})
	)

	colorThemeState = themeService.getColorTheme().type
	disposables.push(
		themeService.onDidColorThemeChange(({ type }) => {
			colorThemeState = type
			colorThemeStateListeners.forEach(l => l(colorThemeState))
		})
	)

	// no state
	disposables.push(
		editCodeService.onDidChangeStreamingInCtrlKZone(({ diffareaid }) => {
			const isStreaming = editCodeService.isCtrlKZoneStreaming({ diffareaid })
			ctrlKZoneStreamingStateListeners.forEach(l => l(diffareaid, isStreaming))
		})
	)

	disposables.push(
		voidCommandBarService.onDidChangeState(({ uri }) => {
			commandBarURIStateListeners.forEach(l => l(uri));
		})
	)

	disposables.push(
		voidCommandBarService.onDidChangeActiveURI(({ uri }) => {
			activeURIListeners.forEach(l => l(uri));
		})
	)

	disposables.push(
		mcpService.onDidChangeState(() => {
			mcpListeners.forEach(l => l())
		})
	)

	// AI Action Log Service listeners (RK IDE autonomous AI system)
	aiActionLogState = aiActionLogService.state
	disposables.push(
		aiActionLogService.onDidChangeState((state) => {
			aiActionLogState = state
			aiActionLogStateListeners.forEach(l => l(aiActionLogState))
		})
	)
	disposables.push(
		aiActionLogService.onDidLogAction((log) => {
			aiActionLogListeners.forEach(l => l(log))
		})
	)

	// Firebase Auth Service listeners
	firebaseAuthState = firebaseAuthService.state
	disposables.push(
		firebaseAuthService.onDidChangeAuthState((state) => {
			firebaseAuthState = state
			firebaseAuthStateListeners.forEach(l => l(firebaseAuthState))
		})
	)

	return disposables
}



const getReactAccessor = (accessor: ServicesAccessor) => {
	const reactAccessor = {
		IModelService: accessor.get(IModelService),
		IClipboardService: accessor.get(IClipboardService),
		IContextViewService: accessor.get(IContextViewService),
		IContextMenuService: accessor.get(IContextMenuService),
		IFileService: accessor.get(IFileService),
		IHoverService: accessor.get(IHoverService),
		IThemeService: accessor.get(IThemeService),
		ILLMMessageService: accessor.get(ILLMMessageService),
		IRefreshModelService: accessor.get(IRefreshModelService),
		IVoidSettingsService: accessor.get(IVoidSettingsService),
		IEditCodeService: accessor.get(IEditCodeService),
		IChatThreadService: accessor.get(IChatThreadService),

		IInstantiationService: accessor.get(IInstantiationService),
		ICodeEditorService: accessor.get(ICodeEditorService),
		ICommandService: accessor.get(ICommandService),
		IContextKeyService: accessor.get(IContextKeyService),
		INotificationService: accessor.get(INotificationService),
		IAccessibilityService: accessor.get(IAccessibilityService),
		ILanguageConfigurationService: accessor.get(ILanguageConfigurationService),
		ILanguageDetectionService: accessor.get(ILanguageDetectionService),
		ILanguageFeaturesService: accessor.get(ILanguageFeaturesService),
		IKeybindingService: accessor.get(IKeybindingService),
		ISearchService: accessor.get(ISearchService),

		IExplorerService: accessor.get(IExplorerService),
		IEnvironmentService: accessor.get(IEnvironmentService),
		IConfigurationService: accessor.get(IConfigurationService),
		IPathService: accessor.get(IPathService),
		IMetricsService: accessor.get(IMetricsService),
		ITerminalToolService: accessor.get(ITerminalToolService),
		ILanguageService: accessor.get(ILanguageService),
		IVoidModelService: accessor.get(IVoidModelService),
		IWorkspaceContextService: accessor.get(IWorkspaceContextService),

		IVoidCommandBarService: accessor.get(IVoidCommandBarService),
		INativeHostService: accessor.get(INativeHostService),
		IToolsService: accessor.get(IToolsService),
		IConvertToLLMMessageService: accessor.get(IConvertToLLMMessageService),
		ITerminalService: accessor.get(ITerminalService),
		IExtensionManagementService: accessor.get(IExtensionManagementService),
		IExtensionTransferService: accessor.get(IExtensionTransferService),
		IMCPService: accessor.get(IMCPService),
		IAIActionLogService: accessor.get(IAIActionLogService),
		IAutonomousFileService: accessor.get(IAutonomousFileService),
		IAsyncTaskQueueService: accessor.get(IAsyncTaskQueueService),
		IApiService: accessor.get(IApiService),
		IApiServerService: accessor.get(IApiServerService),
		IFirebaseSyncService: accessor.get(IFirebaseSyncService),
		IFirebaseAuthService: accessor.get(IFirebaseAuthService),

		IStorageService: accessor.get(IStorageService),

	} as const
	return reactAccessor
}

type ReactAccessor = ReturnType<typeof getReactAccessor>


let reactAccessor_: ReactAccessor | null = null
const _registerAccessor = (accessor: ServicesAccessor) => {
	const reactAccessor = getReactAccessor(accessor)
	reactAccessor_ = reactAccessor
}

// -- services --
export const useAccessor = () => {
	if (!reactAccessor_) {
		throw new Error(`⚠️ Void useAccessor was called before _registerServices!`)
	}

	return { get: <S extends keyof ReactAccessor,>(service: S): ReactAccessor[S] => reactAccessor_![service] }
}



// -- state of services --

export const useSettingsState = () => {
	const [s, ss] = useState(settingsState)
	useEffect(() => {
		ss(settingsState)
		settingsStateListeners.add(ss)
		return () => { settingsStateListeners.delete(ss) }
	}, [ss])
	return s
}

export const useChatThreadsState = () => {
	const [s, ss] = useState(chatThreadsState)
	useEffect(() => {
		ss(chatThreadsState)
		chatThreadsStateListeners.add(ss)
		return () => { chatThreadsStateListeners.delete(ss) }
	}, [ss])
	return s
	// allow user to set state natively in react
	// const ss: React.Dispatch<React.SetStateAction<ThreadsState>> = (action)=>{
	// 	_ss(action)
	// 	if (typeof action === 'function') {
	// 		const newState = action(chatThreadsState)
	// 		chatThreadsState = newState
	// 	} else {
	// 		chatThreadsState = action
	// 	}
	// }
	// return [s, ss] as const
}




export const useChatThreadsStreamState = (threadId: string) => {
	const [s, ss] = useState<ThreadStreamState[string] | undefined>(chatThreadsStreamState[threadId])
	useEffect(() => {
		ss(chatThreadsStreamState[threadId])
		const listener = (threadId_: string) => {
			if (threadId_ !== threadId) return
			ss(chatThreadsStreamState[threadId])
		}
		chatThreadsStreamStateListeners.add(listener)
		return () => { chatThreadsStreamStateListeners.delete(listener) }
	}, [ss, threadId])
	return s
}

export const useFullChatThreadsStreamState = () => {
	const [s, ss] = useState(chatThreadsStreamState)
	useEffect(() => {
		ss(chatThreadsStreamState)
		const listener = () => { ss(chatThreadsStreamState) }
		chatThreadsStreamStateListeners.add(listener)
		return () => { chatThreadsStreamStateListeners.delete(listener) }
	}, [ss])
	return s
}



export const useRefreshModelState = () => {
	const [s, ss] = useState(refreshModelState)
	useEffect(() => {
		ss(refreshModelState)
		refreshModelStateListeners.add(ss)
		return () => { refreshModelStateListeners.delete(ss) }
	}, [ss])
	return s
}


export const useRefreshModelListener = (listener: (providerName: RefreshableProviderName, s: RefreshModelStateOfProvider) => void) => {
	useEffect(() => {
		refreshModelProviderListeners.add(listener)
		return () => { refreshModelProviderListeners.delete(listener) }
	}, [listener, refreshModelProviderListeners])
}

export const useCtrlKZoneStreamingState = (listener: (diffareaid: number, s: boolean) => void) => {
	useEffect(() => {
		ctrlKZoneStreamingStateListeners.add(listener)
		return () => { ctrlKZoneStreamingStateListeners.delete(listener) }
	}, [listener, ctrlKZoneStreamingStateListeners])
}

export const useIsDark = () => {
	const [s, ss] = useState(colorThemeState)
	useEffect(() => {
		ss(colorThemeState)
		colorThemeStateListeners.add(ss)
		return () => { colorThemeStateListeners.delete(ss) }
	}, [ss])

	// s is the theme, return isDark instead of s
	const isDark = s === ColorScheme.DARK || s === ColorScheme.HIGH_CONTRAST_DARK
	return isDark
}

export const useCommandBarURIListener = (listener: (uri: URI) => void) => {
	useEffect(() => {
		commandBarURIStateListeners.add(listener);
		return () => { commandBarURIStateListeners.delete(listener) };
	}, [listener]);
};
export const useCommandBarState = () => {
	const accessor = useAccessor()
	const commandBarService = accessor.get('IVoidCommandBarService')
	const [s, ss] = useState({ stateOfURI: commandBarService.stateOfURI, sortedURIs: commandBarService.sortedURIs });
	const listener = useCallback(() => {
		ss({ stateOfURI: commandBarService.stateOfURI, sortedURIs: commandBarService.sortedURIs });
	}, [commandBarService])
	useCommandBarURIListener(listener)

	return s;
}



// roughly gets the active URI - this is used to get the history of recent URIs
export const useActiveURI = () => {
	const accessor = useAccessor()
	const commandBarService = accessor.get('IVoidCommandBarService')
	const [s, ss] = useState(commandBarService.activeURI)
	useEffect(() => {
		const listener = () => { ss(commandBarService.activeURI) }
		activeURIListeners.add(listener);
		return () => { activeURIListeners.delete(listener) };
	}, [])
	return { uri: s }
}




export const useMCPServiceState = () => {
	const accessor = useAccessor()
	const mcpService = accessor.get('IMCPService')
	const [s, ss] = useState(mcpService.state)
	useEffect(() => {
		const listener = () => { ss(mcpService.state) }
		mcpListeners.add(listener);
		return () => { mcpListeners.delete(listener) };
	}, []);
	return s
}



export const useIsOptedOut = () => {
	const accessor = useAccessor()
	const storageService = accessor.get('IStorageService')

	const getVal = useCallback(() => {
		return storageService.getBoolean(OPT_OUT_KEY, StorageScope.APPLICATION, false)
	}, [storageService])

	const [s, ss] = useState(getVal())

	useEffect(() => {
		const disposables = new DisposableStore();
		const d = storageService.onDidChangeValue(StorageScope.APPLICATION, OPT_OUT_KEY, disposables)(e => {
			ss(getVal())
		})
		disposables.add(d)
		return () => disposables.clear()
	}, [storageService, getVal])

	return s
}

// =============================================
// AI Action Log Hooks (RK IDE autonomous AI system)
// =============================================

/**
 * Hook para obter o estado atual dos logs de ações da IA
 */
export const useAIActionLogState = () => {
	const [s, ss] = useState(aiActionLogState)
	useEffect(() => {
		ss(aiActionLogState)
		aiActionLogStateListeners.add(ss)
		return () => { aiActionLogStateListeners.delete(ss) }
	}, [ss])
	return s
}

/**
 * Hook para receber notificações de novas ações da IA em tempo real
 */
export const useAIActionLogListener = (listener: (log: AIActionLog) => void) => {
	useEffect(() => {
		aiActionLogListeners.add(listener)
		return () => { aiActionLogListeners.delete(listener) }
	}, [listener])
}

/**
 * Hook para obter logs recentes da IA
 */
export const useRecentAILogs = (count: number = 50) => {
	const accessor = useAccessor()
	const aiActionLogService = accessor.get('IAIActionLogService')
	const [logs, setLogs] = useState(aiActionLogService.getRecentLogs(count))

	useAIActionLogListener(useCallback(() => {
		setLogs(aiActionLogService.getRecentLogs(count))
	}, [aiActionLogService, count]))

	return logs
}

/**
 * Hook para obter logs de um arquivo específico
 */
export const useAILogsByFile = (filePath: string) => {
	const accessor = useAccessor()
	const aiActionLogService = accessor.get('IAIActionLogService')
	const [logs, setLogs] = useState(aiActionLogService.getLogsByFile(filePath))

	useAIActionLogListener(useCallback((log: AIActionLog) => {
		if (log.file.includes(filePath)) {
			setLogs(aiActionLogService.getLogsByFile(filePath))
		}
	}, [aiActionLogService, filePath]))

	return logs
}

/**
 * Hook para gerenciar tarefas assíncronas
 */
export const useAsyncTasks = () => {
	const accessor = useAccessor()
	const service = accessor.get('IAsyncTaskQueueService')
	const [tasks, setTasks] = useState(service.getTasks())
	const [pendingCount, setPendingCount] = useState(service.getPendingTasks().length)

	useEffect(() => {
		const update = () => {
			setTasks(service.getTasks())
			setPendingCount(service.getPendingTasks().length)
		}

		const d1 = service.onDidAddTask(update)
		const d2 = service.onDidUpdateTask(update)

		return () => {
			d1.dispose()
			d2.dispose()
		}
	}, [service])

	return {
		tasks,
		pendingCount,
		queueTask: service.queueTask.bind(service),
		cancelTask: service.cancelTask.bind(service)
	}
}


// =============================================
// Firebase Sync Hooks (RK IDE - comunicação externa)
// =============================================

/**
 * Hook para obter o estado da sincronização Firebase
 */
export const useFirebaseSyncState = () => {
	const accessor = useAccessor()
	const firebaseSyncService = accessor.get('IFirebaseSyncService')
	const [state, setState] = useState(firebaseSyncService.state)

	useEffect(() => {
		setState(firebaseSyncService.state)
		const disposable = firebaseSyncService.onDidChangeState((newState) => {
			setState(newState)
		})
		return () => disposable.dispose()
	}, [firebaseSyncService])

	return state
}

/**
 * Hook para gerenciar a conexão Firebase
 */
export const useFirebaseSync = () => {
	const accessor = useAccessor()
	const firebaseSyncService = accessor.get('IFirebaseSyncService')
	const state = useFirebaseSyncState()

	const initialize = useCallback(async (config: {
		apiKey: string;
		authDomain: string;
		projectId: string;
		storageBucket: string;
		messagingSenderId: string;
		appId: string;
	}) => {
		await firebaseSyncService.initialize(config)
	}, [firebaseSyncService])

	const disconnect = useCallback(async () => {
		await firebaseSyncService.disconnect()
	}, [firebaseSyncService])

	const syncNow = useCallback(async () => {
		await firebaseSyncService.updateStatus()
		await firebaseSyncService.syncLogs()
		await firebaseSyncService.syncChat()
	}, [firebaseSyncService])

	return {
		state,
		userId: firebaseSyncService.getUserId(),
		initialize,
		disconnect,
		syncNow
	}
}

// =============================================
// Firebase Auth Hooks (RK IDE - autenticação)
// =============================================

/**
 * Hook para obter o estado de autenticação Firebase
 */
export const useFirebaseAuthState = () => {
	const [s, ss] = useState(firebaseAuthState)
	useEffect(() => {
		ss(firebaseAuthState)
		firebaseAuthStateListeners.add(ss)
		return () => { firebaseAuthStateListeners.delete(ss) }
	}, [ss])
	return s
}

/**
 * Hook para gerenciar autenticação Firebase
 */
export const useFirebaseAuth = () => {
	const accessor = useAccessor()
	const firebaseAuthService = accessor.get('IFirebaseAuthService')
	const state = useFirebaseAuthState()

	const signInWithGoogle = useCallback(async () => {
		return await firebaseAuthService.signInWithGoogle()
	}, [firebaseAuthService])

	const signInWithEmail = useCallback(async (email: string, password: string) => {
		return await firebaseAuthService.signInWithEmail(email, password)
	}, [firebaseAuthService])

	const createAccount = useCallback(async (email: string, password: string, displayName?: string) => {
		return await firebaseAuthService.createAccount(email, password, displayName)
	}, [firebaseAuthService])

	const sendPasswordResetEmail = useCallback(async (email: string) => {
		return await firebaseAuthService.sendPasswordResetEmail(email)
	}, [firebaseAuthService])

	const signOut = useCallback(async () => {
		return await firebaseAuthService.signOut()
	}, [firebaseAuthService])

	return {
		state,
		user: state?.user || null,
		isAuthenticated: state?.isAuthenticated || false,
		loading: state?.loading || false,
		error: state?.error || null,
		signInWithGoogle,
		signInWithEmail,
		createAccount,
		sendPasswordResetEmail,
		signOut
	}
}
