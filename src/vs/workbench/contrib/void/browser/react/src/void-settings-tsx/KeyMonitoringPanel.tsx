/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useCallback, useEffect, useState } from 'react';
import { ProviderName, displayInfoOfProviderName, nonlocalProviderNames } from '../../../../common/voidSettingsTypes.js';
import { useAccessor, useSettingsState } from '../util/services.js';
import { VoidButtonBgDarken } from '../util/inputs.js';
import { RefreshCw, AlertTriangle, CheckCircle, Clock, Activity } from 'lucide-react';
import ErrorBoundary from '../sidebar-tsx/ErrorBoundary.js';

interface TokenUsageStats {
	hourlyUsage: number;
	dailyUsage: number;
	monthlyUsage: number;
	hourlyLimit?: number;
	dailyLimit?: number;
	monthlyLimit?: number;
	hourlyUtilization: number;
	dailyUtilization: number;
	monthlyUtilization: number;
}

interface ProviderKeyStatus {
	provider: ProviderName;
	currentKeyIndex: number;
	totalKeys: number;
	usage: TokenUsageStats;
	shouldRotate: boolean;
	hasLimits: boolean;
}

const formatNumber = (num: number): string => {
	if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
	if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
	return num.toString();
};

const formatDate = (date: Date): string => {
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / (1000 * 60));
	const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

	if (diffMins < 1) return 'Just now';
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	return `${diffDays}d ago`;
};

const UsageBar = ({ current, limit, label }: { current: number; limit: number; label: string }) => {
	const percentage = limit > 0 ? Math.min((current / limit) * 100, 100) : 0;
	const isHigh = percentage > 80;
	const isMedium = percentage > 60;

	return (
		<div className="mb-2">
			<div className="flex justify-between text-xs text-void-fg-3 mb-1">
				<span>{label}</span>
				<span>{formatNumber(current)} {limit > 0 ? `/ ${formatNumber(limit)}` : ''}</span>
			</div>
			<div className="w-full bg-void-bg-2 rounded-full h-2">
				<div
					className={`h-2 rounded-full transition-all duration-300 ${
						isHigh ? 'bg-red-500' : isMedium ? 'bg-yellow-500' : 'bg-green-500'
					}`}
					style={{ width: `${percentage}%` }}
				/>
			</div>
		</div>
	);
};

const ProviderKeyCard = ({ status, onRotate, onReset }: {
	status: ProviderKeyStatus;
	onRotate: () => void;
	onReset: () => void;
}) => {
	const { title } = displayInfoOfProviderName(status.provider);
	const { usage, shouldRotate, hasLimits } = status;

	return (
		<div className="bg-void-bg-1 border border-void-border-1 rounded-lg p-4 mb-4">
			<div className="flex items-center justify-between mb-3">
				<div className="flex items-center gap-2">
					<h3 className="text-lg font-medium">{title}</h3>
					{shouldRotate && (
						<AlertTriangle size={16} className="text-yellow-500" />
					)}
					{!hasLimits && (
						<div className="text-xs text-void-fg-3 bg-void-bg-2 px-2 py-1 rounded">
							No limits
						</div>
					)}
				</div>
				<div className="flex items-center gap-2 text-sm text-void-fg-3">
					<span>Key {status.currentKeyIndex + 1} of {status.totalKeys}</span>
				</div>
			</div>

			{hasLimits && (
				<div className="mb-4">
					{usage.hourlyLimit && usage.hourlyLimit > 0 && (
						<UsageBar current={usage.hourlyUsage} limit={usage.hourlyLimit} label="Hourly" />
					)}
					{usage.dailyLimit && usage.dailyLimit > 0 && (
						<UsageBar current={usage.dailyUsage} limit={usage.dailyLimit} label="Daily" />
					)}
					{usage.monthlyLimit && usage.monthlyLimit > 0 && (
						<UsageBar current={usage.monthlyUsage} limit={usage.monthlyLimit} label="Monthly" />
					)}
				</div>
			)}

			<div className="flex items-center justify-between text-sm text-void-fg-3 mb-3">
				<div className="flex items-center gap-1">
					<Activity size={14} />
					<span>Usage: H:{formatNumber(usage.hourlyUsage)} D:{formatNumber(usage.dailyUsage)} M:{formatNumber(usage.monthlyUsage)}</span>
				</div>
				<div className="flex items-center gap-1">
					<Clock size={14} />
					<span>Utilization: {Math.max(usage.hourlyUtilization, usage.dailyUtilization, usage.monthlyUtilization).toFixed(1)}%</span>
				</div>
			</div>

			<div className="flex gap-2">
				<VoidButtonBgDarken
					className="px-3 py-1 text-sm flex items-center gap-1"
					onClick={onRotate}
					disabled={status.totalKeys <= 1}
				>
					<RefreshCw size={14} />
					Rotate Key
				</VoidButtonBgDarken>
				<VoidButtonBgDarken
					className="px-3 py-1 text-sm"
					onClick={onReset}
				>
					Reset Usage
				</VoidButtonBgDarken>
			</div>

			{shouldRotate && (
				<div className="mt-3 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded text-sm text-yellow-600">
					⚠️ Proactive rotation recommended due to high usage
				</div>
			)}
		</div>
	);
};

export const KeyMonitoringPanel = () => {
	const accessor = useAccessor();
	const voidSettingsService = accessor.get('IVoidSettingsService');
	const settingsState = useSettingsState();
	const [providerStatuses, setProviderStatuses] = useState<ProviderKeyStatus[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	const loadProviderStatuses = useCallback(async () => {
		setIsLoading(true);
		try {
			const statuses: ProviderKeyStatus[] = [];

			for (const provider of nonlocalProviderNames) {
				const providerSettings = settingsState.settingsOfProvider[provider];
				if (!providerSettings?.apiKeys?.length) continue;

				const currentKeyIndex = providerSettings.currentKeyIndex || 0;
				const currentApiKey = providerSettings.apiKeys[currentKeyIndex];
				if (!currentApiKey) continue;

				// Get usage stats
				const usageStats = await voidSettingsService.getTokenUsageStats(provider);
				
				// Check if rotation is needed
				const shouldRotate = await voidSettingsService.shouldRotateProactively(provider);

				// Check if provider has limits configured
				const limits = providerSettings.providerLimits;
				const hasLimits = !!(limits?.tokensPerHour || limits?.tokensPerDay || limits?.maxTokensTotal);

				statuses.push({
					provider,
					currentKeyIndex,
					totalKeys: providerSettings.apiKeys.length,
					usage: usageStats || {
						hourlyUsage: 0,
						dailyUsage: 0,
						monthlyUsage: 0,
						hourlyUtilization: 0,
						dailyUtilization: 0,
						monthlyUtilization: 0,
					},
					shouldRotate,
					hasLimits,
				});
			}

			setProviderStatuses(statuses);
		} catch (error) {
			console.error('Failed to load provider statuses:', error);
		} finally {
			setIsLoading(false);
		}
	}, [voidSettingsService, settingsState]);

	useEffect(() => {
		loadProviderStatuses();
	}, [loadProviderStatuses]);

	const handleRotateKey = useCallback(async (provider: ProviderName) => {
		try {
			await voidSettingsService.rotateToNextApiKey(provider);
			await loadProviderStatuses(); // Refresh data
		} catch (error) {
			console.error(`Failed to rotate key for ${provider}:`, error);
		}
	}, [voidSettingsService, loadProviderStatuses]);

	const handleResetUsage = useCallback(async (provider: ProviderName) => {
		try {
			await voidSettingsService.resetTokenUsage(provider);
			await loadProviderStatuses(); // Refresh data
		} catch (error) {
			console.error(`Failed to reset usage for ${provider}:`, error);
		}
	}, [voidSettingsService, loadProviderStatuses]);

	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-8">
				<RefreshCw className="animate-spin mr-2" size={20} />
				<span>Loading key monitoring data...</span>
			</div>
		);
	}

	if (providerStatuses.length === 0) {
		return (
			<div className="text-center py-8 text-void-fg-3">
				<AlertTriangle size={48} className="mx-auto mb-4 opacity-50" />
				<p>No API keys configured for monitoring.</p>
				<p className="text-sm mt-2">Add API keys in the Providers section to see usage statistics.</p>
			</div>
		);
	}

	const totalActiveKeys = providerStatuses.reduce((sum, status) => sum + status.totalKeys, 0);
	const keysNeedingRotation = providerStatuses.filter(status => status.shouldRotate).length;

	return (
		<ErrorBoundary>
			<div className="max-w-4xl">
				<div className="mb-6">
					<div className="flex items-center justify-between mb-4">
						<div>
							<h2 className="text-3xl mb-2">API Key Monitoring</h2>
							<p className="text-void-fg-3">Monitor usage statistics and manage API key rotation for optimal performance.</p>
						</div>
						<VoidButtonBgDarken
							className="px-4 py-2 flex items-center gap-2"
							onClick={loadProviderStatuses}
						>
							<RefreshCw size={16} />
							Refresh
						</VoidButtonBgDarken>
					</div>

					{/* Summary Stats */}
					<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
						<div className="bg-void-bg-1 border border-void-border-1 rounded-lg p-4">
							<div className="flex items-center gap-2 mb-2">
								<CheckCircle size={16} className="text-green-500" />
								<span className="text-sm text-void-fg-3">Active Providers</span>
							</div>
							<div className="text-2xl font-bold">{providerStatuses.length}</div>
						</div>
						<div className="bg-void-bg-1 border border-void-border-1 rounded-lg p-4">
							<div className="flex items-center gap-2 mb-2">
								<Activity size={16} className="text-blue-500" />
								<span className="text-sm text-void-fg-3">Total Keys</span>
							</div>
							<div className="text-2xl font-bold">{totalActiveKeys}</div>
						</div>
						<div className="bg-void-bg-1 border border-void-border-1 rounded-lg p-4">
							<div className="flex items-center gap-2 mb-2">
								<AlertTriangle size={16} className="text-yellow-500" />
								<span className="text-sm text-void-fg-3">Need Rotation</span>
							</div>
							<div className="text-2xl font-bold">{keysNeedingRotation}</div>
						</div>
					</div>
				</div>

				{/* Provider Cards */}
				<div className="space-y-4">
					{providerStatuses.map((status) => (
						<ProviderKeyCard
							key={status.provider}
							status={status}
							onRotate={() => handleRotateKey(status.provider)}
							onReset={() => handleResetUsage(status.provider)}
						/>
					))}
				</div>
			</div>
		</ErrorBoundary>
	);
};