/*--------------------------------------------------------------------------------------
 *  Copyright 2025 RK IDE. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useMemo } from 'react';
import { useRecentAILogs, useAIActionLogState } from '../util/services.js';
import { LogEntry } from './LogEntry.js';
import { AIActionLog } from '../../../../common/aiActionLogTypes.js';

// Inline Icons
const SearchIcon = ({ className }: { className?: string }) => (
	<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
);
const RefreshCwIcon = ({ className }: { className?: string }) => (
	<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
);
const PauseIcon = ({ className }: { className?: string }) => (
	<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
);
const PlayIcon = ({ className }: { className?: string }) => (
	<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
);
const DownloadIcon = ({ className }: { className?: string }) => (
	<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
);

export const AIActionLogPanel = () => {
	// Hooks would be available via the services integration
	// For now mocking the connection to the service via what we added to services.tsx
	const logs = useRecentAILogs(100);
	const { isActive } = useAIActionLogState();

	const [searchTerm, setSearchTerm] = useState('');
	const [filterAction, setFilterAction] = useState<string | null>(null);
	const [filterImpact, setFilterImpact] = useState<string | null>(null);

	const filteredLogs = useMemo(() => {
		return logs.filter(log => {
			const matchesSearch = log.file.toLowerCase().includes(searchTerm.toLowerCase()) ||
				log.reason.toLowerCase().includes(searchTerm.toLowerCase());

			const matchesAction = filterAction ? log.action === filterAction : true;
			const matchesImpact = filterImpact ? log.impact === filterImpact : true;

			return matchesSearch && matchesAction && matchesImpact;
		});
	}, [logs, searchTerm, filterAction, filterImpact]);

	// This would connect to the service actions
	const handleExport = () => {
		const json = JSON.stringify(logs, null, 2);
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `void_ai_logs_${new Date().toISOString()}.json`;
		a.click();
		URL.revokeObjectURL(url);
	};

	return (
		<div className="flex flex-col h-full bg-void-bg-base text-void-fg-1">
			{/* Header */}
			<div className="border-b border-void-border-2 p-4 flex flex-col gap-4">
				<div className="flex items-center justify-between">
					<h2 className="text-xl font-light">AI Actions Log</h2>
					<div className="flex items-center gap-2">
						<button
							className="p-1.5 rounded hover:bg-void-bg-2 text-void-fg-3 hover:text-void-fg-1 transition-colors"
							title={isActive ? "Pause logging" : "Resume logging"}
						>
							{isActive ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
						</button>
						<button
							className="p-1.5 rounded hover:bg-void-bg-2 text-void-fg-3 hover:text-void-fg-1 transition-colors"
							onClick={handleExport}
							title="Export Logs"
						>
							<DownloadIcon className="w-4 h-4" />
						</button>
					</div>
				</div>

				{/* Search and Filters */}
				<div className="flex gap-2">
					<div className="relative flex-1">
						<SearchIcon className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-void-fg-3" />
						<input
							type="text"
							placeholder="Search files or reasons..."
							className="w-full pl-9 pr-3 py-1.5 text-sm bg-void-bg-1 border border-void-border-2 rounded text-void-fg-1 focus:border-void-fg-3 outline-none"
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
						/>
					</div>
				</div>

				<div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
					<FilterBadge
						label="All Actions"
						active={filterAction === null}
						onClick={() => setFilterAction(null)}
					/>
					<FilterBadge
						label="Create"
						color="emerald"
						active={filterAction === 'create'}
						onClick={() => setFilterAction(filterAction === 'create' ? null : 'create')}
					/>
					<FilterBadge
						label="Update"
						color="blue"
						active={filterAction === 'update'}
						onClick={() => setFilterAction(filterAction === 'update' ? null : 'update')}
					/>
					<FilterBadge
						label="Delete"
						color="rose"
						active={filterAction === 'delete'}
						onClick={() => setFilterAction(filterAction === 'delete' ? null : 'delete')}
					/>
				</div>
			</div>

			<div className="flex-1 overflow-y-auto p-4 space-y-2">
				{filteredLogs.length === 0 ? (
					<div className="flex flex-col items-center justify-center h-full text-void-fg-3 opacity-50 gap-2">
						<RefreshCwIcon className="w-8 h-8" />
						<p>No logs found matching your filters</p>
					</div>
				) : (
					filteredLogs.map(log => (
						<LogEntry key={log.id} log={log} />
					))
				)}
			</div>

			{/* Footer Status */}
			<div className="bg-void-bg-2 p-2 px-4 text-xs text-void-fg-3 border-t border-void-border-2 flex justify-between items-center">
				<span>{filteredLogs.length} entries shown</span>
				<span className={`flex items-center gap-1.5 ${isActive ? 'text-emerald-500' : 'text-amber-500'}`}>
					<span className="w-2 h-2 rounded-full bg-current relative">
						{isActive && <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-75"></span>}
					</span>
					{isActive ? 'Monitoring AI Actions' : 'Logging Paused'}
				</span>
			</div>
		</div>
	);
};

const FilterBadge = ({ label, active, onClick, color }: { label: string, active: boolean, onClick: () => void, color?: string }) => {
	let activeClass = 'bg-void-fg-1 text-void-bg-base';
	if (color === 'emerald') activeClass = 'bg-emerald-500 text-white';
	if (color === 'blue') activeClass = 'bg-blue-500 text-white';
	if (color === 'rose') activeClass = 'bg-rose-500 text-white';

	return (
		<button
			className={`
                px-3 py-1 rounded-full text-xs whitespace-nowrap transition-all border border-transparent
                ${active
					? activeClass
					: 'bg-void-bg-2 text-void-fg-2 hover:bg-void-bg-3 border-void-border-2'
				}
            `}
			onClick={onClick}
		>
			{label}
		</button>
	);
};
