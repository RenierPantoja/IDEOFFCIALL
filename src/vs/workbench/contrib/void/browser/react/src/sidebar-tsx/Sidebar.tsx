import { useState } from 'react';
import { useIsDark, useFirebaseAuth } from '../util/services.js';
import '../styles.css'
import { SidebarChat } from './SidebarChat.js';
import { AIActionLogPanel } from '../ai-logs/AIActionLogPanel.js';
import ErrorBoundary from './ErrorBoundary.js';
import { AuthModal } from '../auth/AuthModal.js';

// Simple Icons components
const IconMessage = ({ className }: { className?: string }) => (
	<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
		<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
	</svg>
);

const IconActivity = ({ className }: { className?: string }) => (
	<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
		<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
	</svg>
);

const IconUser = ({ className }: { className?: string }) => (
	<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
		<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
		<circle cx="12" cy="7" r="4"></circle>
	</svg>
);

const IconLogOut = ({ className }: { className?: string }) => (
	<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
		<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
		<polyline points="16 17 21 12 16 7"></polyline>
		<line x1="21" y1="12" x2="9" y2="12"></line>
	</svg>
);

// Account Panel Component
const AccountPanel = ({ onOpenAuthModal }: { onOpenAuthModal: () => void }) => {
	const isDark = useIsDark();
	const { user, isAuthenticated, signOut, loading } = useFirebaseAuth();

	if (isAuthenticated && user) {
		return (
			<div className="h-full flex flex-col p-4">
				<div className={`rounded-xl p-6 ${isDark ? 'bg-zinc-800/50' : 'bg-gray-100'}`}>
					<div className="flex items-center gap-4 mb-4">
						{user.photoURL ? (
							<img
								src={user.photoURL}
								alt={user.displayName || 'Avatar'}
								className="w-16 h-16 rounded-full"
							/>
						) : (
							<div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold ${isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-600'}`}>
								{user.displayName?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || 'U'}
							</div>
						)}
						<div className="flex-1 min-w-0">
							<h3 className={`font-semibold text-lg truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
								{user.displayName || 'Usuário'}
							</h3>
							<p className={`text-sm truncate ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
								{user.email}
							</p>
							{!user.emailVerified && (
								<span className="inline-block mt-1 text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-500">
									Email não verificado
								</span>
							)}
						</div>
					</div>

					<div className={`border-t pt-4 ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
						<button
							onClick={() => signOut()}
							disabled={loading}
							className={`w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
								isDark
									? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
									: 'bg-red-50 text-red-600 hover:bg-red-100'
							} ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
						>
							<IconLogOut className="w-4 h-4" />
							{loading ? 'Saindo...' : 'Sair da conta'}
						</button>
					</div>
				</div>

				{/* Account Info */}
				<div className={`mt-4 rounded-xl p-4 ${isDark ? 'bg-zinc-800/50' : 'bg-gray-100'}`}>
					<h4 className={`font-medium mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
						Informações da conta
					</h4>
					<div className="space-y-2">
						<div className="flex justify-between text-sm">
							<span className={isDark ? 'text-zinc-400' : 'text-gray-500'}>Provedor</span>
							<span className={isDark ? 'text-zinc-300' : 'text-gray-700'}>
								{user.providerId === 'password' ? 'Email/Senha' : 'Google'}
							</span>
						</div>
						<div className="flex justify-between text-sm">
							<span className={isDark ? 'text-zinc-400' : 'text-gray-500'}>ID</span>
							<span className={`${isDark ? 'text-zinc-300' : 'text-gray-700'} font-mono text-xs truncate max-w-[150px]`}>
								{user.uid}
							</span>
						</div>
					</div>
				</div>

				{/* Sync Status */}
				<div className={`mt-4 rounded-xl p-4 ${isDark ? 'bg-zinc-800/50' : 'bg-gray-100'}`}>
					<h4 className={`font-medium mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
						Sincronização
					</h4>
					<div className="flex items-center gap-2">
						<div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
						<span className={`text-sm ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
							Conectado
						</span>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="h-full flex flex-col items-center justify-center p-6">
			<div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 ${isDark ? 'bg-zinc-800' : 'bg-gray-100'}`}>
				<IconUser className={`w-10 h-10 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`} />
			</div>

			<h3 className={`text-xl font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
				Faça login
			</h3>

			<p className={`text-sm text-center mb-6 max-w-xs ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
				Entre na sua conta para sincronizar suas configurações e histórico de chat entre dispositivos.
			</p>

			<button
				onClick={onOpenAuthModal}
				className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors"
			>
				Entrar ou criar conta
			</button>
		</div>
	);
};

export const Sidebar = ({ className: _className }: { className: string }) => {
	const isDark = useIsDark();
	const [activeTab, setActiveTab] = useState<'chat' | 'logs' | 'account'>('chat');
	const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

	return (
		<div
			className={`@@void-scope ${isDark ? 'dark' : ''} flex flex-col h-full bg-void-bg-2 text-void-fg-1`}
			style={{ width: '100%', height: '100%' }}
		>
			{/* Tabs Header */}
			<div className="flex border-b border-void-border-2">
				<button
					className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'chat'
						? 'border-void-fg-1 text-void-fg-1 bg-void-bg-1'
						: 'border-transparent text-void-fg-3 hover:text-void-fg-1 hover:bg-void-bg-1/50'
						}`}
					onClick={() => setActiveTab('chat')}
				>
					<IconMessage className="w-4 h-4" />
					Chat
				</button>
				<button
					className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'logs'
						? 'border-emerald-500 text-emerald-500 bg-emerald-500/5'
						: 'border-transparent text-void-fg-3 hover:text-void-fg-1 hover:bg-void-bg-1/50'
						}`}
					onClick={() => setActiveTab('logs')}
				>
					<IconActivity className="w-4 h-4" />
					AI Logs
				</button>
				<button
					className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'account'
						? 'border-blue-500 text-blue-500 bg-blue-500/5'
						: 'border-transparent text-void-fg-3 hover:text-void-fg-1 hover:bg-void-bg-1/50'
						}`}
					onClick={() => setActiveTab('account')}
				>
					<IconUser className="w-4 h-4" />
					Conta
				</button>
			</div>

			{/* Content Area */}
			<div className="flex-1 overflow-hidden relative">
				<ErrorBoundary>
					{activeTab === 'chat' ? (
						<SidebarChat />
					) : activeTab === 'logs' ? (
						<div className="h-full w-full absolute inset-0 overflow-hidden">
							<AIActionLogPanel />
						</div>
					) : (
						<AccountPanel onOpenAuthModal={() => setIsAuthModalOpen(true)} />
					)}
				</ErrorBoundary>
			</div>

			{/* Auth Modal */}
			<AuthModal
				isOpen={isAuthModalOpen}
				onClose={() => setIsAuthModalOpen(false)}
			/>
		</div>
	);
}
