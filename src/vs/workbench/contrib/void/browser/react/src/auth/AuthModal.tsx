/*--------------------------------------------------------------------------------------
 *  Copyright 2025 RK IDE. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useCallback } from 'react';
import { X, Mail, Lock, User } from 'lucide-react';
import { useIsDark, useFirebaseAuth } from '../util/services.js';

type AuthMode = 'login' | 'register' | 'forgot-password';

interface AuthModalProps {
	isOpen: boolean;
	onClose: () => void;
}

// Google Icon SVG
const GoogleIcon = ({ className }: { className?: string }) => (
	<svg className={className} viewBox="0 0 24 24" width="20" height="20">
		<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
		<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
		<path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
		<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
	</svg>
);

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
	const isDark = useIsDark();
	const { signInWithGoogle, signInWithEmail, createAccount, sendPasswordResetEmail, loading } = useFirebaseAuth();

	const [mode, setMode] = useState<AuthMode>('login');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [displayName, setDisplayName] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);

	const resetForm = useCallback(() => {
		setEmail('');
		setPassword('');
		setConfirmPassword('');
		setDisplayName('');
		setError(null);
		setSuccessMessage(null);
	}, []);

	const handleClose = useCallback(() => {
		resetForm();
		onClose();
	}, [onClose, resetForm]);

	const handleGoogleLogin = useCallback(async () => {
		setError(null);
		try {
			await signInWithGoogle();
			setSuccessMessage('Login com Google realizado com sucesso!');
			setTimeout(() => {
				handleClose();
			}, 1500);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Erro ao fazer login com Google');
		}
	}, [signInWithGoogle, handleClose]);

	const handleEmailLogin = useCallback(async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);

		if (!email || !password) {
			setError('Por favor, preencha todos os campos');
			return;
		}

		try {
			await signInWithEmail(email, password);
			setSuccessMessage('Login realizado com sucesso!');
			setTimeout(() => {
				handleClose();
			}, 1500);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Email ou senha incorretos');
		}
	}, [email, password, signInWithEmail, handleClose]);

	const handleRegister = useCallback(async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);

		if (!email || !password || !confirmPassword) {
			setError('Por favor, preencha todos os campos');
			return;
		}

		if (password !== confirmPassword) {
			setError('As senhas não coincidem');
			return;
		}

		if (password.length < 6) {
			setError('A senha deve ter pelo menos 6 caracteres');
			return;
		}

		try {
			await createAccount(email, password, displayName || undefined);
			setSuccessMessage('Conta criada com sucesso!');
			setTimeout(() => {
				handleClose();
			}, 1500);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Erro ao criar conta');
		}
	}, [email, password, confirmPassword, displayName, createAccount, handleClose]);

	const handleForgotPassword = useCallback(async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);

		if (!email) {
			setError('Por favor, informe seu email');
			return;
		}

		try {
			await sendPasswordResetEmail(email);
			setSuccessMessage('Email de recuperação enviado! Verifique sua caixa de entrada.');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Erro ao enviar email de recuperação');
		}
	}, [email, sendPasswordResetEmail]);

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-[9999] flex items-center justify-center">
			{/* Backdrop */}
			<div
				className="absolute inset-0 bg-black/60 backdrop-blur-sm"
				onClick={handleClose}
			/>

			{/* Modal */}
			<div className={`relative w-full max-w-md mx-4 rounded-xl shadow-2xl overflow-hidden ${isDark ? 'bg-zinc-900' : 'bg-white'}`}>
				{/* Header */}
				<div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
					<h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
						{mode === 'login' && 'Entrar na sua conta'}
						{mode === 'register' && 'Criar nova conta'}
						{mode === 'forgot-password' && 'Recuperar senha'}
					</h2>
					<button
						onClick={handleClose}
						className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-gray-100 text-gray-500'}`}
					>
						<X size={20} />
					</button>
				</div>

				{/* Content */}
				<div className="px-6 py-6">
					{/* Success Message */}
					{successMessage && (
						<div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-sm">
							{successMessage}
						</div>
					)}

					{/* Error Message */}
					{error && (
						<div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
							{error}
						</div>
					)}

					{/* Google Login Button */}
					{mode !== 'forgot-password' && (
						<>
							<button
								onClick={handleGoogleLogin}
								disabled={loading}
								className={`w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors mb-4 ${
									isDark
										? 'bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700'
										: 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-300'
								} ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
							>
								<GoogleIcon />
								Continuar com Google
							</button>

							<div className="relative my-6">
								<div className={`absolute inset-0 flex items-center ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
									<div className={`w-full border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`} />
								</div>
								<div className="relative flex justify-center text-sm">
									<span className={`px-4 ${isDark ? 'bg-zinc-900 text-zinc-400' : 'bg-white text-gray-500'}`}>
										ou
									</span>
								</div>
							</div>
						</>
					)}

					{/* Login Form */}
					{mode === 'login' && (
						<form onSubmit={handleEmailLogin} className="space-y-4">
							<div>
								<label className={`block text-sm font-medium mb-2 ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
									Email
								</label>
								<div className="relative">
									<Mail size={18} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`} />
									<input
										type="email"
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										placeholder="seu@email.com"
										className={`w-full pl-10 pr-4 py-3 rounded-lg border transition-colors ${
											isDark
												? 'bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500 focus:border-blue-500'
												: 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500'
										} focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
									/>
								</div>
							</div>

							<div>
								<label className={`block text-sm font-medium mb-2 ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
									Senha
								</label>
								<div className="relative">
									<Lock size={18} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`} />
									<input
										type="password"
										value={password}
										onChange={(e) => setPassword(e.target.value)}
										placeholder="••••••••"
										className={`w-full pl-10 pr-4 py-3 rounded-lg border transition-colors ${
											isDark
												? 'bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500 focus:border-blue-500'
												: 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500'
										} focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
									/>
								</div>
							</div>

							<div className="flex justify-end">
								<button
									type="button"
									onClick={() => { setMode('forgot-password'); resetForm(); }}
									className="text-sm text-blue-500 hover:text-blue-400 transition-colors"
								>
									Esqueceu a senha?
								</button>
							</div>

							<button
								type="submit"
								disabled={loading}
								className={`w-full py-3 rounded-lg font-medium transition-colors ${
									loading
										? 'bg-blue-500/50 cursor-not-allowed'
										: 'bg-blue-500 hover:bg-blue-600'
								} text-white`}
							>
								{loading ? 'Entrando...' : 'Entrar'}
							</button>
						</form>
					)}

					{/* Register Form */}
					{mode === 'register' && (
						<form onSubmit={handleRegister} className="space-y-4">
							<div>
								<label className={`block text-sm font-medium mb-2 ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
									Nome (opcional)
								</label>
								<div className="relative">
									<User size={18} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`} />
									<input
										type="text"
										value={displayName}
										onChange={(e) => setDisplayName(e.target.value)}
										placeholder="Seu nome"
										className={`w-full pl-10 pr-4 py-3 rounded-lg border transition-colors ${
											isDark
												? 'bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500 focus:border-blue-500'
												: 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500'
										} focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
									/>
								</div>
							</div>

							<div>
								<label className={`block text-sm font-medium mb-2 ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
									Email
								</label>
								<div className="relative">
									<Mail size={18} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`} />
									<input
										type="email"
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										placeholder="seu@email.com"
										className={`w-full pl-10 pr-4 py-3 rounded-lg border transition-colors ${
											isDark
												? 'bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500 focus:border-blue-500'
												: 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500'
										} focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
									/>
								</div>
							</div>

							<div>
								<label className={`block text-sm font-medium mb-2 ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
									Senha
								</label>
								<div className="relative">
									<Lock size={18} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`} />
									<input
										type="password"
										value={password}
										onChange={(e) => setPassword(e.target.value)}
										placeholder="Mínimo 6 caracteres"
										className={`w-full pl-10 pr-4 py-3 rounded-lg border transition-colors ${
											isDark
												? 'bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500 focus:border-blue-500'
												: 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500'
										} focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
									/>
								</div>
							</div>

							<div>
								<label className={`block text-sm font-medium mb-2 ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
									Confirmar Senha
								</label>
								<div className="relative">
									<Lock size={18} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`} />
									<input
										type="password"
										value={confirmPassword}
										onChange={(e) => setConfirmPassword(e.target.value)}
										placeholder="Repita a senha"
										className={`w-full pl-10 pr-4 py-3 rounded-lg border transition-colors ${
											isDark
												? 'bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500 focus:border-blue-500'
												: 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500'
										} focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
									/>
								</div>
							</div>

							<button
								type="submit"
								disabled={loading}
								className={`w-full py-3 rounded-lg font-medium transition-colors ${
									loading
										? 'bg-emerald-500/50 cursor-not-allowed'
										: 'bg-emerald-500 hover:bg-emerald-600'
								} text-white`}
							>
								{loading ? 'Criando conta...' : 'Criar conta'}
							</button>
						</form>
					)}

					{/* Forgot Password Form */}
					{mode === 'forgot-password' && (
						<form onSubmit={handleForgotPassword} className="space-y-4">
							<p className={`text-sm mb-4 ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>
								Digite seu email e enviaremos um link para redefinir sua senha.
							</p>

							<div>
								<label className={`block text-sm font-medium mb-2 ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
									Email
								</label>
								<div className="relative">
									<Mail size={18} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`} />
									<input
										type="email"
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										placeholder="seu@email.com"
										className={`w-full pl-10 pr-4 py-3 rounded-lg border transition-colors ${
											isDark
												? 'bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500 focus:border-blue-500'
												: 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500'
										} focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
									/>
								</div>
							</div>

							<button
								type="submit"
								disabled={loading}
								className={`w-full py-3 rounded-lg font-medium transition-colors ${
									loading
										? 'bg-blue-500/50 cursor-not-allowed'
										: 'bg-blue-500 hover:bg-blue-600'
								} text-white`}
							>
								{loading ? 'Enviando...' : 'Enviar email de recuperação'}
							</button>
						</form>
					)}
				</div>

				{/* Footer */}
				<div className={`px-6 py-4 border-t ${isDark ? 'border-zinc-700 bg-zinc-800/50' : 'border-gray-200 bg-gray-50'}`}>
					{mode === 'login' && (
						<p className={`text-sm text-center ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>
							Não tem uma conta?{' '}
							<button
								onClick={() => { setMode('register'); resetForm(); }}
								className="text-blue-500 hover:text-blue-400 font-medium transition-colors"
							>
								Criar conta
							</button>
						</p>
					)}
					{mode === 'register' && (
						<p className={`text-sm text-center ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>
							Já tem uma conta?{' '}
							<button
								onClick={() => { setMode('login'); resetForm(); }}
								className="text-blue-500 hover:text-blue-400 font-medium transition-colors"
							>
								Entrar
							</button>
						</p>
					)}
					{mode === 'forgot-password' && (
						<p className={`text-sm text-center ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>
							Lembrou a senha?{' '}
							<button
								onClick={() => { setMode('login'); resetForm(); }}
								className="text-blue-500 hover:text-blue-400 font-medium transition-colors"
							>
								Voltar ao login
							</button>
						</p>
					)}
				</div>
			</div>
		</div>
	);
};

export default AuthModal;
