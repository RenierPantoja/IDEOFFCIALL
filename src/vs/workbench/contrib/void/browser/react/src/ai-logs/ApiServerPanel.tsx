/*--------------------------------------------------------------------------------------
 *  Copyright 2025 RK IDE. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect, useCallback } from 'react';
import { useAccessor } from '../util/services.js';

// Inline Icons
const ServerIcon = ({ className }: { className?: string }) => (
	<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
		<rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
		<rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
		<line x1="6" y1="6" x2="6.01" y2="6"></line>
		<line x1="6" y1="18" x2="6.01" y2="18"></line>
	</svg>
);

const PlayIcon = ({ className }: { className?: string }) => (
	<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
		<polygon points="5 3 19 12 5 21 5 3"></polygon>
	</svg>
);

const StopIcon = ({ className }: { className?: string }) => (
	<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
		<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
	</svg>
);

const CopyIcon = ({ className }: { className?: string }) => (
	<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
		<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
		<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
	</svg>
);

const CheckIcon = ({ className }: { className?: string }) => (
	<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
		<polyline points="20 6 9 17 4 12"></polyline>
	</svg>
);

export const ApiServerPanel = () => {
	const accessor = useAccessor();
	const apiService = accessor.get('IApiService');

	const [isRunning, setIsRunning] = useState(apiService.isServerRunning);
	const [port, setPort] = useState(23119);
	const [copied, setCopied] = useState<string | null>(null);

	useEffect(() => {
		const checkStatus = () => {
			setIsRunning(apiService.isServerRunning);
		};

		// Check status periodically
		const interval = setInterval(checkStatus, 1000);
		return () => clearInterval(interval);
	}, [apiService]);

	const handleStart = useCallback(async () => {
		try {
			await apiService.startServer(port);
			setIsRunning(true);
		} catch (error) {
			console.error('Failed to start server:', error);
		}
	}, [apiService, port]);

	const handleStop = useCallback(async () => {
		try {
			await apiService.stopServer();
			setIsRunning(false);
		} catch (error) {
			console.error('Failed to stop server:', error);
		}
	}, [apiService]);

	const copyToClipboard = useCallback((text: string, key: string) => {
		navigator.clipboard.writeText(text);
		setCopied(key);
		setTimeout(() => setCopied(null), 2000);
	}, []);

	const baseUrl = `http://localhost:${port}`;
	const wsUrl = `ws://localhost:${port}/api/void/realtime`;

	const endpoints = [
		{ method: 'GET', path: '/api/void/status', desc: 'Status do IDE' },
		{ method: 'GET', path: '/api/void/logs', desc: 'Obter logs' },
		{ method: 'GET', path: '/api/void/chat/history', desc: 'Histórico do chat' },
		{ method: 'POST', path: '/api/void/chat/send', desc: 'Enviar mensagem' },
		{ method: 'POST', path: '/api/void/model/change', desc: 'Trocar modelo' },
		{ method: 'POST', path: '/api/void/file/operation', desc: 'Operação de arquivo' },
	];

	return (
		<div className="flex flex-col h-full bg-void-bg-base text-void-fg-1 p-4">
			{/* Header */}
			<div className="flex items-center gap-3 mb-6">
				<div className={`p-2 rounded-lg ${isRunning ? 'bg-emerald-500/20' : 'bg-void-bg-2'}`}>
					<ServerIcon className={`w-6 h-6 ${isRunning ? 'text-emerald-500' : 'text-void-fg-3'}`} />
				</div>
				<div>
					<h2 className="text-lg font-medium">API Server</h2>
					<p className="text-xs text-void-fg-3">
						{isRunning ? `Rodando na porta ${port}` : 'Servidor parado'}
					</p>
				</div>
			</div>

			{/* Controls */}
			<div className="flex gap-3 mb-6">
				<div className="flex-1">
					<label className="text-xs text-void-fg-3 mb-1 block">Porta</label>
					<input
						type="number"
						value={port}
						onChange={(e) => setPort(Number(e.target.value))}
						disabled={isRunning}
						className="w-full px-3 py-2 text-sm bg-void-bg-1 border border-void-border-2 rounded text-void-fg-1 focus:border-void-fg-3 outline-none disabled:opacity-50"
					/>
				</div>
				<div className="flex items-end">
					{isRunning ? (
						<button
							onClick={handleStop}
							className="flex items-center gap-2 px-4 py-2 bg-rose-500/20 text-rose-500 rounded hover:bg-rose-500/30 transition-colors"
						>
							<StopIcon className="w-4 h-4" />
							Parar
						</button>
					) : (
						<button
							onClick={handleStart}
							className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 text-emerald-500 rounded hover:bg-emerald-500/30 transition-colors"
						>
							<PlayIcon className="w-4 h-4" />
							Iniciar
						</button>
					)}
				</div>
			</div>

			{/* URLs */}
			{isRunning && (
				<div className="mb-6 space-y-3">
					<div>
						<label className="text-xs text-void-fg-3 mb-1 block">Base URL (REST)</label>
						<div className="flex items-center gap-2">
							<code className="flex-1 px-3 py-2 text-sm bg-void-bg-1 border border-void-border-2 rounded font-mono text-void-fg-2">
								{baseUrl}
							</code>
							<button
								onClick={() => copyToClipboard(baseUrl, 'base')}
								className="p-2 rounded hover:bg-void-bg-2 text-void-fg-3 hover:text-void-fg-1 transition-colors"
								title="Copiar"
							>
								{copied === 'base' ? <CheckIcon className="w-4 h-4 text-emerald-500" /> : <CopyIcon className="w-4 h-4" />}
							</button>
						</div>
					</div>

					<div>
						<label className="text-xs text-void-fg-3 mb-1 block">WebSocket URL</label>
						<div className="flex items-center gap-2">
							<code className="flex-1 px-3 py-2 text-sm bg-void-bg-1 border border-void-border-2 rounded font-mono text-void-fg-2">
								{wsUrl}
							</code>
							<button
								onClick={() => copyToClipboard(wsUrl, 'ws')}
								className="p-2 rounded hover:bg-void-bg-2 text-void-fg-3 hover:text-void-fg-1 transition-colors"
								title="Copiar"
							>
								{copied === 'ws' ? <CheckIcon className="w-4 h-4 text-emerald-500" /> : <CopyIcon className="w-4 h-4" />}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Endpoints */}
			<div className="flex-1 overflow-y-auto">
				<h3 className="text-sm font-medium mb-3 text-void-fg-2">Endpoints Disponíveis</h3>
				<div className="space-y-2">
					{endpoints.map((endpoint, i) => (
						<div
							key={i}
							className="flex items-center gap-3 p-2 bg-void-bg-1 border border-void-border-2 rounded text-sm"
						>
							<span className={`px-2 py-0.5 rounded text-xs font-mono ${endpoint.method === 'GET'
									? 'bg-blue-500/20 text-blue-400'
									: 'bg-amber-500/20 text-amber-400'
								}`}>
								{endpoint.method}
							</span>
							<code className="flex-1 font-mono text-void-fg-2 text-xs">{endpoint.path}</code>
							<span className="text-void-fg-3 text-xs">{endpoint.desc}</span>
						</div>
					))}
				</div>
			</div>

			{/* Example */}
			<div className="mt-4 p-3 bg-void-bg-1 border border-void-border-2 rounded">
				<h4 className="text-xs font-medium text-void-fg-2 mb-2">Exemplo de uso (JavaScript)</h4>
				<pre className="text-xs font-mono text-void-fg-3 overflow-x-auto">
					{`// Enviar mensagem para o chat
fetch('${baseUrl}/api/void/chat/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'Olá, crie um arquivo test.js'
  })
});

// WebSocket para eventos em tempo real
const ws = new WebSocket('${wsUrl}');
ws.onmessage = (e) => console.log(JSON.parse(e.data));`}
				</pre>
			</div>
		</div>
	);
};
