/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js'
import { ProviderName, ProviderLimits } from './voidSettingsTypes.js'
import { Disposable } from '../../../../base/common/lifecycle.js'
import { ILogService } from '../../../../platform/log/common/log.js'

export interface TokenUsageEntry {
	timestamp: number
	tokens: number
}

export interface KeyUsageData {
	usage: TokenUsageEntry[]
	lastDailyReset?: number
	lastMonthlyReset?: number
	lastHourlyReset?: number
}

// Remove the unused TokenUsageData interface as it's not being used
// and conflicts with the actual data structure

export interface TokenUsageStats {
	hourlyUsage: number
	dailyUsage: number
	monthlyUsage: number
	hourlyLimit?: number
	dailyLimit?: number
	monthlyLimit?: number
	hourlyUtilization: number
	dailyUtilization: number
	monthlyUtilization: number
}

/**
 * Tracks token usage for API keys with automatic rotation based on usage thresholds
 */
export class TokenUsageTracker extends Disposable {
	private readonly STORAGE_KEY = 'void.tokenUsage';
	private readonly CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
	private readonly DATA_RETENTION_DAYS = 30;
	private readonly PROACTIVE_ROTATION_THRESHOLD = 0.8; // 80%
	
	private cleanupTimer: NodeJS.Timeout | undefined;
	private usageData: Map<string, TokenUsageEntry> = new Map();

	constructor(
		private readonly storageService: IStorageService,
		private readonly logService: ILogService
	) {
		super();
		this.loadUsageData();
		this.startCleanupTimer();
		this.logService.info('[TokenUsageTracker] Initialized with persistent storage and logging');
	}

	private startCleanupTimer(): void {
		// Set up automatic cleanup every hour
		this.cleanupTimer = setInterval(() => {
			this.cleanupExpiredData()
		}, this.CLEANUP_INTERVAL)
		this.logService.info('[TokenUsageTracker] Started cleanup timer with interval of 1 hour')
	}

	private cleanupExpiredData(): void {
		const data = this.loadUsageData()
		const now = Date.now()
		let hasChanges = false
		let removedCount = 0

		for (const [providerKey, providerData] of Object.entries(data)) {
			for (const [keyIndex, keyData] of Object.entries(providerData)) {
				const originalLength = keyData.usage.length
				const filteredUsage = keyData.usage.filter(entry => {
					const entryAge = now - entry.timestamp
					// Keep entries within 30 days (monthly limits)
					return entryAge < (30 * 24 * 60 * 60 * 1000)
				})

				if (filteredUsage.length !== originalLength) {
					keyData.usage = filteredUsage
					removedCount += originalLength - filteredUsage.length
					hasChanges = true
				}
			}
		}

		if (hasChanges) {
			this.saveUsageData(data)
			this.logService.info(`[TokenUsageTracker] Cleaned up ${removedCount} expired usage entries (older than ${this.DATA_RETENTION_DAYS} days)`)
		}
	}

	/**
	 * Automatically reset usage counters based on time windows
	 */
	private autoResetCounters(providerName: ProviderName, limits: ProviderLimits): void {
		const data = this.loadUsageData()
		const providerKey = providerName
		
		if (!data[providerKey] || !data[providerKey]['0']) return

		const keyData = data[providerKey]['0']
		if (!keyData) return

		const now = Date.now()
		let hasChanges = false

		// Check daily limits reset (24 hours)
		if (limits.tokensPerDay && keyData.lastDailyReset) {
			const timeSinceLastDailyReset = now - keyData.lastDailyReset
			const oneDayInMs = 24 * 60 * 60 * 1000

			if (timeSinceLastDailyReset >= oneDayInMs) {
				// Reset daily usage
				keyData.usage = keyData.usage.filter(entry => {
					return (now - entry.timestamp) < oneDayInMs
				})
				keyData.lastDailyReset = now
				hasChanges = true
			}
		}

		// Check total token limits reset (30 days)
		if (limits.maxTokensTotal && keyData.lastMonthlyReset) {
			const timeSinceLastMonthlyReset = now - keyData.lastMonthlyReset
			const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000

			if (timeSinceLastMonthlyReset >= thirtyDaysInMs) {
				// Reset monthly usage
				keyData.usage = keyData.usage.filter(entry => {
					return (now - entry.timestamp) < thirtyDaysInMs
				})
				keyData.lastMonthlyReset = now
				hasChanges = true
			}
		}

		// Check hourly limits reset (1 hour)
		if (limits.tokensPerHour && keyData.lastHourlyReset) {
			const timeSinceLastHourlyReset = now - keyData.lastHourlyReset
			const oneHourInMs = 60 * 60 * 1000

			if (timeSinceLastHourlyReset >= oneHourInMs) {
				// Reset hourly usage
				keyData.usage = keyData.usage.filter(entry => {
					return (now - entry.timestamp) < oneHourInMs
				})
				keyData.lastHourlyReset = now
				hasChanges = true
			}
		}

		if (hasChanges) {
			this.saveUsageData(data)
		}
	}

	/**
	 * Initialize reset timestamps for a new key
	 */
	private initializeResetTimestamps(keyData: KeyUsageData): void {
		const now = Date.now()
		if (!keyData.lastDailyReset) keyData.lastDailyReset = now
		if (!keyData.lastMonthlyReset) keyData.lastMonthlyReset = now
		if (!keyData.lastHourlyReset) keyData.lastHourlyReset = now
	}

	/**
	 * Load usage data from storage
	 */
	private loadUsageData(): Record<string, Record<string, KeyUsageData>> {
		try {
			const stored = this.storageService.get(this.STORAGE_KEY, StorageScope.APPLICATION, '{}')
			const parsed = JSON.parse(stored)
			if (Object.keys(parsed).length > 0) {
				this.logService.debug(`[TokenUsageTracker] Loaded usage data for ${Object.keys(parsed).length} providers from storage`)
			} else {
				this.logService.debug('[TokenUsageTracker] No existing usage data found in storage')
			}
			return parsed
		} catch (error) {
			this.logService.error('[TokenUsageTracker] Failed to load usage data from storage:', error)
			return {}
		}
	}

	/**
	 * Save usage data to storage
	 */
	private saveUsageData(data: Record<string, Record<string, KeyUsageData>>): void {
		try {
			this.storageService.store(this.STORAGE_KEY, JSON.stringify(data), StorageScope.APPLICATION, StorageTarget.MACHINE)
			this.logService.debug(`[TokenUsageTracker] Saved usage data for ${Object.keys(data).length} providers to storage`)
		} catch (error) {
			this.logService.error('[TokenUsageTracker] Failed to save usage data to storage:', error)
		}
	}

	/**
	 * Calculate usage within a specific time window
	 */
	private calculateUsageInWindow(usage: TokenUsageEntry[], currentTime: number, windowMs: number): number {
		const windowStart = currentTime - windowMs
		return usage
			.filter(entry => entry.timestamp >= windowStart)
			.reduce((total, entry) => total + entry.tokens, 0)
	}

	/**
	 * Record token usage for a specific provider
	 */
	recordUsage(providerName: ProviderName, tokensUsed: number): void {
		const data = this.loadUsageData()
		const providerKey = providerName
		
		this.logService.info(`[TokenUsageTracker] Recording ${tokensUsed} tokens for ${providerName}`)
		
		if (!data[providerKey]) {
			data[providerKey] = {}
		}
		
		if (!data[providerKey]['0']) {
			data[providerKey]['0'] = {
				usage: [],
				lastDailyReset: Date.now(),
				lastMonthlyReset: Date.now(),
				lastHourlyReset: Date.now()
			}
		}

		const keyData = data[providerKey]['0']
		this.initializeResetTimestamps(keyData)

		// Add new usage entry
		keyData.usage.push({
			timestamp: Date.now(),
			tokens: tokensUsed
		})

		this.saveUsageData(data)
		this.logService.debug(`[TokenUsageTracker] Recorded ${tokensUsed} tokens for ${providerName}. Total entries: ${keyData.usage.length}`)
	}

	/**
	 * Determine if proactive rotation is needed based on thresholds
	 */
	shouldRotateProactively(providerName: ProviderName, limits: ProviderLimits): boolean {
		// First, perform automatic reset if needed
		this.autoResetCounters(providerName, limits)
		
		const data = this.loadUsageData()
		const providerKey = providerName
		
		if (!data[providerKey] || !data[providerKey]['0']) {
			this.logService.debug(`[TokenUsageTracker] No usage data found for ${providerName}, rotation not needed`)
			return false
		}

		const keyData = data[providerKey]['0']
		const now = Date.now()

		// Calculate current usage for different time windows
		const hourlyUsage = this.calculateUsageInWindow(keyData.usage, now, 60 * 60 * 1000) // 1 hour
		const dailyUsage = this.calculateUsageInWindow(keyData.usage, now, 24 * 60 * 60 * 1000) // 24 hours
		const monthlyUsage = this.calculateUsageInWindow(keyData.usage, now, 30 * 24 * 60 * 60 * 1000) // 30 days

		// Check against thresholds (rotate when reaching 80% of limit)
		const threshold = this.PROACTIVE_ROTATION_THRESHOLD

		const hourlyThreshold = limits.hourlyTokenLimit ? hourlyUsage / limits.hourlyTokenLimit : 0
		const dailyThreshold = limits.dailyTokenLimit ? dailyUsage / limits.dailyTokenLimit : 0
		const monthlyThreshold = limits.monthlyTokenLimit ? monthlyUsage / limits.monthlyTokenLimit : 0

		const maxThreshold = Math.max(hourlyThreshold, dailyThreshold, monthlyThreshold)
		const shouldRotate = maxThreshold >= threshold

		if (shouldRotate) {
			this.logService.warn(`[TokenUsageTracker] Proactive rotation recommended for ${providerName}: ` +
				`hourly=${(hourlyThreshold * 100).toFixed(1)}%, daily=${(dailyThreshold * 100).toFixed(1)}%, monthly=${(monthlyThreshold * 100).toFixed(1)}%`)
		} else {
			this.logService.debug(`[TokenUsageTracker] Rotation not needed for ${providerName}: ` +
				`hourly=${(hourlyThreshold * 100).toFixed(1)}%, daily=${(dailyThreshold * 100).toFixed(1)}%, monthly=${(monthlyThreshold * 100).toFixed(1)}%`)
		}

		return shouldRotate
	}

	/**
	 * Get usage statistics for a specific provider
	 */
	getUsageStats(providerName: ProviderName, limits: ProviderLimits): TokenUsageStats | null {
		// First, perform automatic reset if needed
		this.autoResetCounters(providerName, limits)
		
		const data = this.loadUsageData()
		const providerKey = providerName
		
		if (!data[providerKey] || !data[providerKey]['0']) {
			this.logService.debug(`[TokenUsageTracker] No usage data found for ${providerName}`)
			return null
		}

		const keyData = data[providerKey]['0']
		const now = Date.now()

		// Calculate usage for different time windows
		const hourlyUsage = this.calculateUsageInWindow(keyData.usage, now, 60 * 60 * 1000)
		const dailyUsage = this.calculateUsageInWindow(keyData.usage, now, 24 * 60 * 60 * 1000)
		const monthlyUsage = this.calculateUsageInWindow(keyData.usage, now, 30 * 24 * 60 * 60 * 1000)

		return {
			hourlyUsage,
			dailyUsage,
			monthlyUsage,
			hourlyLimit: limits.hourlyTokenLimit,
			dailyLimit: limits.dailyTokenLimit,
			monthlyLimit: limits.monthlyTokenLimit,
			hourlyUtilization: limits.hourlyTokenLimit ? hourlyUsage / limits.hourlyTokenLimit : 0,
			dailyUtilization: limits.dailyTokenLimit ? dailyUsage / limits.dailyTokenLimit : 0,
			monthlyUtilization: limits.monthlyTokenLimit ? monthlyUsage / limits.monthlyTokenLimit : 0
		}
	}

	/**
	 * Reset usage data for a specific provider
	 */
	resetUsage(providerName: ProviderName): void {
		const data = this.loadUsageData()
		const providerKey = providerName
		
		this.logService.info(`[TokenUsageTracker] Resetting usage data for ${providerName}`)
		
		if (data[providerKey] && data[providerKey]['0']) {
			data[providerKey]['0'] = {
				usage: [],
				lastDailyReset: Date.now(),
				lastMonthlyReset: Date.now(),
				lastHourlyReset: Date.now()
			}
			this.saveUsageData(data)
		}
	}

	/**
	 * Clear all usage data
	 */
	clearAllUsage(): void {
		const data = this.loadUsageData();
		const entriesCount = Object.keys(data).length;
		this.storageService.remove(this.STORAGE_KEY, StorageScope.APPLICATION);
		this.logService.info(`[TokenUsageTracker] Cleared all usage data (${entriesCount} entries removed)`);
	}

	/**
	 * Estimate token count for a given text (simple approximation)
	 */
	estimateTokens(text: string): number {
		// Simple approximation: ~4 characters per token for most models
		return Math.ceil(text.length / 4)
	}

	dispose(): void {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer)
			this.cleanupTimer = undefined
		}
	}
}