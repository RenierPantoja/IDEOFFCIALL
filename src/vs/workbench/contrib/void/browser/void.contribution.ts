/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/


// register inline diffs
import './editCodeService.js'

// register Sidebar pane, state, actions (keybinds, menus) (Ctrl+L)
import './sidebarActions.js'
import './sidebarPane.js'

// register quick edit (Ctrl+K)
import './quickEditActions.js'


// register Autocomplete
import './autocompleteService.js'

// register Context services
// import './contextGatheringService.js'
// import './contextUserChangesService.js'

// settings pane
import './voidSettingsPane.js'

// register css
import './media/void.css'

// update (frontend part, also see platform/)
import './voidUpdateActions.js'

import './convertToLLMMessageWorkbenchContrib.js'

// tools
import './toolsService.js'
import './terminalToolService.js'

// register Thread History
import './chatThreadService.js'

// ping
import './metricsPollService.js'

// helper services
import './helperServices/consistentItemService.js'

// register selection helper
import './voidSelectionHelperWidget.js'

// register tooltip service
import './tooltipService.js'

// register onboarding service
import './voidOnboardingService.js'

// register misc service
import './miscWokrbenchContrib.js'

// register file service (for explorer context menu)
import './fileService.js'

// register source control management
import './voidSCMService.js'

// ---------- common (unclear if these actually need to be imported, because they're already imported wherever they're used) ----------

// llmMessage
import '../common/sendLLMMessageService.js'

// voidSettings
import '../common/voidSettingsService.js'

// refreshModel
import '../common/refreshModelService.js'

// metrics
import '../common/metricsService.js'

// updates
import '../common/voidUpdateService.js'

// model service
import '../common/voidModelService.js'

// AI Action Log Service (RK IDE autonomous AI system)
import './aiActionLogService.js'

// Autonomous File Service (RK IDE autonomous AI system)
import './autonomousFileService.js'

// Realtime Communication Service (RK IDE autonomous AI system)
import './realtimeCommService.js'

// Async Task Queue Service (RK IDE autonomous AI system)
import './asyncTaskQueueService.js'

// Model Switch Service (RK IDE autonomous AI system)
import './modelSwitchService.js'

// Error Handling Service (RK IDE autonomous AI system)
import './errorHandlingService.js'

// API Service (RK IDE autonomous AI system - external communication)
import './apiService.js'

// API Server Service proxy (RK IDE autonomous AI system - electron-main communication)
import '../common/apiServerService.js'

// Firebase Sync Service (RK IDE - comunicação com sites externos via Firebase)
import './firebaseSyncService.js'

// Firebase Auth Service (RK IDE - autenticação Firebase)
import './firebaseAuthService.js'
