/*--------------------------------------------------------------------------------------
 *  Copyright 2025 RK IDE. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { FirebaseAuthState, FirebaseAuthUser, FirebaseConfig } from '../common/firebaseSyncTypes.js';

// Storage keys
const FIREBASE_AUTH_USER_KEY = 'void.firebase.authUser';
const FIREBASE_CONFIG_KEY = 'void.firebase.config';

/**
 * Interface do serviço de autenticação Firebase
 */
export interface IFirebaseAuthService {
	readonly _serviceBrand: undefined;

	/** Estado atual da autenticação */
	readonly state: FirebaseAuthState;

	/** Evento quando o estado de autenticação muda */
	readonly onDidChangeAuthState: Event<FirebaseAuthState>;

	/** Inicializa o Firebase Auth */
	initialize(config: FirebaseConfig): Promise<void>;

	/** Login com Google */
	signInWithGoogle(): Promise<FirebaseAuthUser>;

	/** Login com email e senha */
	signInWithEmail(email: string, password: string): Promise<FirebaseAuthUser>;

	/** Criar conta com email e senha */
	createAccount(email: string, password: string, displayName?: string): Promise<FirebaseAuthUser>;

	/** Enviar email de recuperação de senha */
	sendPasswordResetEmail(email: string): Promise<void>;

	/** Logout */
	signOut(): Promise<void>;

	/** Obter usuário atual */
	getCurrentUser(): FirebaseAuthUser | null;
}

export const IFirebaseAuthService = createDecorator<IFirebaseAuthService>('firebaseAuthService');

/**
 * Implementação do serviço de autenticação Firebase
 */
export class FirebaseAuthService extends Disposable implements IFirebaseAuthService {
	readonly _serviceBrand: undefined;

	private _state: FirebaseAuthState = {
		isAuthenticated: false,
		user: null,
		loading: false,
		error: null
	};

	private _config: FirebaseConfig | null = null;

	private readonly _onDidChangeAuthState = this._register(new Emitter<FirebaseAuthState>());
	readonly onDidChangeAuthState: Event<FirebaseAuthState> = this._onDidChangeAuthState.event;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
		this._log('FirebaseAuthService initialized');

		// Carregar usuário salvo
		this._loadSavedUser();
	}

	get state(): FirebaseAuthState {
		return { ...this._state };
	}

	private _loadSavedUser(): void {
		try {
			const savedUser = this.storageService.get(FIREBASE_AUTH_USER_KEY, StorageScope.APPLICATION);
			if (savedUser) {
				const user = JSON.parse(savedUser) as FirebaseAuthUser;
				this._state.user = user;
				this._state.isAuthenticated = true;
				this._updateState();
			}
		} catch (error) {
			this._log(`Error loading saved user: ${error}`);
		}
	}

	private _saveUser(user: FirebaseAuthUser | null): void {
		if (user) {
			this.storageService.store(
				FIREBASE_AUTH_USER_KEY,
				JSON.stringify(user),
				StorageScope.APPLICATION,
				StorageTarget.USER
			);
		} else {
			this.storageService.remove(FIREBASE_AUTH_USER_KEY, StorageScope.APPLICATION);
		}
	}

	async initialize(config: FirebaseConfig): Promise<void> {
		this._config = config;
		this.storageService.store(
			FIREBASE_CONFIG_KEY,
			JSON.stringify(config),
			StorageScope.APPLICATION,
			StorageTarget.USER
		);
		this._log('Firebase Auth initialized');
	}

	async signInWithGoogle(): Promise<FirebaseAuthUser> {
		if (!this._config) {
			throw new Error('Firebase não configurado. Configure primeiro nas configurações.');
		}

		this._state.loading = true;
		this._state.error = null;
		this._updateState();

		try {
			// Usar Firebase Auth REST API para Google Sign-In
			// Em produção, usar o SDK oficial com signInWithPopup
			const user = await this._googleSignIn();

			this._state.user = user;
			this._state.isAuthenticated = true;
			this._state.loading = false;
			this._saveUser(user);
			this._updateState();

			this._log(`Google sign-in successful: ${user.email}`);
			return user;

		} catch (error) {
			this._state.loading = false;
			this._state.error = error instanceof Error ? error.message : 'Erro ao fazer login com Google';
			this._updateState();
			throw error;
		}
	}

	async signInWithEmail(email: string, password: string): Promise<FirebaseAuthUser> {
		if (!this._config) {
			throw new Error('Firebase não configurado. Configure primeiro nas configurações.');
		}

		this._state.loading = true;
		this._state.error = null;
		this._updateState();

		try {
			const user = await this._emailSignIn(email, password);

			this._state.user = user;
			this._state.isAuthenticated = true;
			this._state.loading = false;
			this._saveUser(user);
			this._updateState();

			this._log(`Email sign-in successful: ${user.email}`);
			return user;

		} catch (error) {
			this._state.loading = false;
			this._state.error = error instanceof Error ? error.message : 'Email ou senha incorretos';
			this._updateState();
			throw error;
		}
	}

	async createAccount(email: string, password: string, displayName?: string): Promise<FirebaseAuthUser> {
		if (!this._config) {
			throw new Error('Firebase não configurado. Configure primeiro nas configurações.');
		}

		this._state.loading = true;
		this._state.error = null;
		this._updateState();

		try {
			const user = await this._createEmailAccount(email, password, displayName);

			this._state.user = user;
			this._state.isAuthenticated = true;
			this._state.loading = false;
			this._saveUser(user);
			this._updateState();

			this._log(`Account created: ${user.email}`);
			return user;

		} catch (error) {
			this._state.loading = false;
			this._state.error = error instanceof Error ? error.message : 'Erro ao criar conta';
			this._updateState();
			throw error;
		}
	}

	async sendPasswordResetEmail(email: string): Promise<void> {
		if (!this._config) {
			throw new Error('Firebase não configurado. Configure primeiro nas configurações.');
		}

		this._state.loading = true;
		this._state.error = null;
		this._updateState();

		try {
			await this._sendResetEmail(email);
			this._state.loading = false;
			this._updateState();
			this._log(`Password reset email sent to: ${email}`);

		} catch (error) {
			this._state.loading = false;
			this._state.error = error instanceof Error ? error.message : 'Erro ao enviar email de recuperação';
			this._updateState();
			throw error;
		}
	}

	async signOut(): Promise<void> {
		this._state.user = null;
		this._state.isAuthenticated = false;
		this._state.error = null;
		this._saveUser(null);
		this._updateState();
		this._log('User signed out');
	}

	getCurrentUser(): FirebaseAuthUser | null {
		return this._state.user;
	}

	// ============================================
	// Firebase REST API Methods
	// ============================================

	private async _googleSignIn(): Promise<FirebaseAuthUser> {
		// Para Google Sign-In via REST API, precisamos de um fluxo OAuth
		// Em um ambiente de desktop, isso geralmente requer abrir um navegador
		// Por enquanto, vamos simular o processo

		// TODO: Implementar OAuth flow real com Google
		// Opções:
		// 1. Usar electron shell.openExternal para OAuth
		// 2. Usar um servidor intermediário
		// 3. Usar Firebase Admin SDK

		throw new Error('Login com Google requer configuração adicional. Use email/senha por enquanto.');
	}

	private async _emailSignIn(email: string, password: string): Promise<FirebaseAuthUser> {
		if (!this._config) throw new Error('Firebase não configurado');

		const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${this._config.apiKey}`;

		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				email,
				password,
				returnSecureToken: true
			})
		});

		const data = await response.json();

		if (!response.ok) {
			throw new Error(this._translateFirebaseError(data.error?.message || 'Erro desconhecido'));
		}

		return {
			uid: data.localId,
			email: data.email,
			displayName: data.displayName || null,
			photoURL: null,
			emailVerified: data.emailVerified || false,
			providerId: 'password'
		};
	}

	private async _createEmailAccount(email: string, password: string, displayName?: string): Promise<FirebaseAuthUser> {
		if (!this._config) throw new Error('Firebase não configurado');

		const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${this._config.apiKey}`;

		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				email,
				password,
				displayName,
				returnSecureToken: true
			})
		});

		const data = await response.json();

		if (!response.ok) {
			throw new Error(this._translateFirebaseError(data.error?.message || 'Erro desconhecido'));
		}

		return {
			uid: data.localId,
			email: data.email,
			displayName: displayName || null,
			photoURL: null,
			emailVerified: false,
			providerId: 'password'
		};
	}

	private async _sendResetEmail(email: string): Promise<void> {
		if (!this._config) throw new Error('Firebase não configurado');

		const url = `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${this._config.apiKey}`;

		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				requestType: 'PASSWORD_RESET',
				email
			})
		});

		const data = await response.json();

		if (!response.ok) {
			throw new Error(this._translateFirebaseError(data.error?.message || 'Erro desconhecido'));
		}
	}

	private _translateFirebaseError(errorCode: string): string {
		const errorMessages: Record<string, string> = {
			'EMAIL_NOT_FOUND': 'Email não encontrado',
			'INVALID_PASSWORD': 'Senha incorreta',
			'USER_DISABLED': 'Usuário desativado',
			'EMAIL_EXISTS': 'Este email já está em uso',
			'OPERATION_NOT_ALLOWED': 'Operação não permitida',
			'TOO_MANY_ATTEMPTS_TRY_LATER': 'Muitas tentativas. Tente novamente mais tarde',
			'WEAK_PASSWORD': 'Senha muito fraca. Use pelo menos 6 caracteres',
			'INVALID_EMAIL': 'Email inválido',
			'MISSING_PASSWORD': 'Senha não informada',
			'INVALID_LOGIN_CREDENTIALS': 'Email ou senha incorretos'
		};

		return errorMessages[errorCode] || `Erro: ${errorCode}`;
	}

	private _updateState(): void {
		this._onDidChangeAuthState.fire(this.state);
	}

	private _log(message: string): void {
		console.log(`[FirebaseAuthService] ${message}`);
	}

	override dispose(): void {
		super.dispose();
	}
}

// Register the service
registerSingleton(IFirebaseAuthService, FirebaseAuthService, InstantiationType.Delayed);
