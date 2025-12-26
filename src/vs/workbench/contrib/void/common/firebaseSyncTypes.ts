/*--------------------------------------------------------------------------------------
 *  Copyright 2025 RK IDE. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/**
 * Tipos para sincronização com Firebase Firestore
 * Permite comunicação entre o IDE local e sites externos via Firebase
 */

// ============================================
// User Profile
// ============================================

export interface FirebaseUserProfile {
	userId: string;
	createdAt: string;
	lastSeen: string;
	ideConnected: boolean;
	ideVersion?: string;
	machineId?: string;
}

// ============================================
// Commands (Site -> IDE)
// ============================================

export type CommandType =
	| 'send_message'
	| 'change_model'
	| 'file_operation'
	| 'get_status'
	| 'get_logs'
	| 'get_chat_history'
	| 'get_thread';

export type CommandStatus = 'pending' | 'processing' | 'completed' | 'error';

export interface FirebaseCommand<T = unknown> {
	id: string;
	type: CommandType;
	payload: T;
	status: CommandStatus;
	createdAt: string;
	processedAt?: string;
	result?: unknown;
	error?: string;
}

// Command Payloads
export interface SendMessagePayload {
	message: string;
	threadId?: string;
	context?: {
		files?: string[];
		cwd?: string;
	};
}

export interface ChangeModelPayload {
	modelName: string;
	providerName: string;
	reason?: string;
}

export interface FileOperationPayload {
	operation: 'read' | 'create' | 'update' | 'delete';
	path: string;
	content?: string;
	reason?: string;
}

export interface GetThreadPayload {
	threadId: string;
}

export interface GetLogsPayload {
	limit?: number;
	action?: string;
	impact?: string;
	fromDate?: string;
	toDate?: string;
}

// ============================================
// Chat Messages
// ============================================

export interface FirebaseChatThread {
	id: string;
	title: string;
	createdAt: string;
	lastModified: string;
	messageCount: number;
}

export interface FirebaseChatMessage {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp: string;
	isStreaming?: boolean;
}

// ============================================
// Logs
// ============================================

export interface FirebaseActionLog {
	id: string;
	action: 'read' | 'create' | 'update' | 'delete';
	file: string;
	reason: string;
	impact: 'baixo' | 'médio' | 'alto';
	details?: string;
	timestamp: string;
}

// ============================================
// Status
// ============================================

export interface FirebaseIDEStatus {
	connected: boolean;
	currentModel: string;
	currentProvider: string;
	logsCount: number;
	pendingTasks: number;
	lastUpdate: string;
}

// ============================================
// Firebase Config
// ============================================

export interface FirebaseConfig {
	apiKey: string;
	authDomain: string;
	projectId: string;
	storageBucket: string;
	messagingSenderId: string;
	appId: string;
}

// ============================================
// Sync State
// ============================================

export interface FirebaseSyncState {
	isConnected: boolean;
	userId: string | null;
	lastSync: string | null;
	pendingCommands: number;
	error: string | null;
}

// ============================================
// Authentication Types
// ============================================

export interface FirebaseAuthUser {
	uid: string;
	email: string | null;
	displayName: string | null;
	photoURL: string | null;
	emailVerified: boolean;
	providerId: string;
}

export interface FirebaseAuthState {
	isAuthenticated: boolean;
	user: FirebaseAuthUser | null;
	loading: boolean;
	error: string | null;
}

export type AuthProvider = 'google' | 'email';
