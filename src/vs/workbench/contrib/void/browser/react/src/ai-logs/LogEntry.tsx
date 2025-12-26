/*--------------------------------------------------------------------------------------
 *  Copyright 2025 RK IDE. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState } from 'react';
import { AIActionLog } from '../../../../common/aiActionLogTypes.js';
import { ImpactBadge } from './ImpactBadge.js';

// Inline Icons
const ChevronDownIcon = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="6 9 12 15 18 9"></polyline></svg>;
const ChevronRightIcon = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="9 18 15 12 9 6"></polyline></svg>;
const PlusIcon = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>;
const Trash2Icon = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>;
const Edit2Icon = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>;
const EyeIcon = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>;

interface LogEntryProps {
	log: AIActionLog;
}

export const LogEntry: React.FC<LogEntryProps> = ({ log }) => {
	const [expanded, setExpanded] = useState(false);

	const getActionIcon = (action: string) => {
		switch (action) {
			case 'create':
				return <PlusIcon className="w-4 h-4 text-emerald-500" />;
			case 'delete':
				return <Trash2Icon className="w-4 h-4 text-rose-500" />;
			case 'update':
				return <Edit2Icon className="w-4 h-4 text-blue-500" />;
			case 'read':
			default:
				return <EyeIcon className="w-4 h-4 text-gray-400" />;
		}
	};

	const formatTime = (isoString: string) => {
		const date = new Date(isoString);
		return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	};

	return (
		<div className="border border-void-border-2 rounded-md bg-void-bg-1 mb-2 overflow-hidden transition-all hover:border-void-border-1">
			<div
				className="flex items-center gap-3 p-3 cursor-pointer select-none"
				onClick={() => setExpanded(!expanded)}
			>
				<div className="text-void-fg-3">
					{expanded ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
				</div>

				<div className="p-1.5 rounded-md bg-void-bg-2">
					{getActionIcon(log.action)}
				</div>

				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 mb-0.5">
						<span className="font-medium text-void-fg-1 truncate" title={log.file}>
							{log.file.split(/[/\\]/).pop()}
						</span>
						<span className="text-xs text-void-fg-3 opacity-60">
							{formatTime(log.timestamp)}
						</span>
					</div>
					<div className="text-xs text-void-fg-2 truncate">
						{log.reason}
					</div>
				</div>

				<ImpactBadge impact={log.impact} />
			</div>

			{expanded && (
				<div className="px-3 pb-3 pt-0 text-sm border-t border-void-border-2 border-dashed mt-0">
					<div className="pt-2 grid grid-cols-[80px_1fr] gap-2">
						<div className="text-void-fg-3 text-xs">Caminho:</div>
						<div className="text-void-fg-2 break-all text-xs font-mono">{log.file}</div>

						<div className="text-void-fg-3 text-xs">Detalhes:</div>
						<div className="text-void-fg-1 whitespace-pre-wrap">{log.details}</div>

						<div className="text-void-fg-3 text-xs">ID:</div>
						<div className="text-void-fg-3 text-xs font-mono opacity-50">{log.id}</div>
					</div>
				</div>
			)}
		</div>
	);
};
