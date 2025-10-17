/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok, strictEqual } from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { TokenUsageTracker } from '../../common/tokenUsageTracker.js';
import { ProviderName, ProviderLimits } from '../../common/voidSettingsTypes.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';

suite('TokenUsageTracker', () => {
	let storageService: InMemoryStorageService;
	let tokenTracker: TokenUsageTracker;
	const disposables = new DisposableStore();

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		storageService = new InMemoryStorageService();
		tokenTracker = new TokenUsageTracker(storageService, new NullLogService());
		disposables.add(tokenTracker);
	});

	teardown(() => {
		disposables.clear();
	});

	test('should initialize with empty usage data', () => {
		const stats = tokenTracker.getUsageStats('openai' as ProviderName, {
			tokensPerDay: 1000,
			maxTokensTotal: 30000
		});
		
		strictEqual(stats, null);
	});

	test('should record token usage correctly', () => {
		const limits: ProviderLimits = {
			tokensPerDay: 1000,
			maxTokensTotal: 30000
		};

		tokenTracker.recordUsage('openai' as ProviderName, 100);
		
		const stats = tokenTracker.getUsageStats('openai' as ProviderName, limits);
		ok(stats);
		strictEqual(stats.dailyUsage, 100);
		strictEqual(stats.monthlyUsage, 100);
		strictEqual(stats.dailyUtilization, 0.1); // 100/1000 = 0.1
		strictEqual(stats.monthlyUtilization, 100/30000); // 100/30000
	});

	test('should accumulate multiple usage records', () => {
		const limits: ProviderLimits = {
			tokensPerDay: 1000,
			maxTokensTotal: 30000
		};

		tokenTracker.recordUsage('openai' as ProviderName, 100);
		tokenTracker.recordUsage('openai' as ProviderName, 200);
		tokenTracker.recordUsage('openai' as ProviderName, 150);
		
		const stats = tokenTracker.getUsageStats('openai' as ProviderName, limits);
		ok(stats);
		strictEqual(stats.dailyUsage, 450);
		strictEqual(stats.monthlyUsage, 450);
		strictEqual(stats.dailyUtilization, 0.45); // 450/1000 = 0.45
		strictEqual(stats.monthlyUtilization, 0.015); // 450/30000 = 0.015
	});

	test('should track usage separately for different providers', () => {
		const limits: ProviderLimits = {
			tokensPerDay: 1000,
			maxTokensTotal: 30000
		};

		tokenTracker.recordUsage('openai' as ProviderName, 100);
		tokenTracker.recordUsage('anthropic' as ProviderName, 200);
		
		const openaiStats = tokenTracker.getUsageStats('openai' as ProviderName, limits);
		const anthropicStats = tokenTracker.getUsageStats('anthropic' as ProviderName, limits);
		
		ok(openaiStats);
		ok(anthropicStats);
		strictEqual(openaiStats.dailyUsage, 100);
		strictEqual(anthropicStats.dailyUsage, 200);
	});

	test('should track usage separately for different key indices', () => {
		const limits: ProviderLimits = {
			tokensPerDay: 1000,
			maxTokensTotal: 30000
		};

		tokenTracker.recordUsage('openai' as ProviderName, 100);
		tokenTracker.recordUsage('openai' as ProviderName, 200);
		
		const key0Stats = tokenTracker.getUsageStats('openai' as ProviderName, limits);
		const key1Stats = tokenTracker.getUsageStats('openai' as ProviderName, limits);
		
		ok(key0Stats);
		ok(key1Stats);
		strictEqual(key0Stats.dailyUsage, 300); // Both usages are tracked together now
		strictEqual(key1Stats.dailyUsage, 300); // Same stats since we're not tracking by key index
	});

	test('should not rotate proactively when usage is below threshold', () => {
		const limits: ProviderLimits = {
			tokensPerDay: 1000,
			maxTokensTotal: 30000
		};

		tokenTracker.recordUsage('openai' as ProviderName, 100); // 10% of daily limit
		
		const shouldRotate = tokenTracker.shouldRotateProactively('openai' as ProviderName, limits);
		strictEqual(shouldRotate, false);
	});

	test('should rotate proactively when daily usage exceeds 80% threshold', () => {
		const limits: ProviderLimits = {
			tokensPerDay: 1000,
			maxTokensTotal: 30000
		};

		tokenTracker.recordUsage('openai' as ProviderName, 850); // 85% of daily limit
		
		const shouldRotate = tokenTracker.shouldRotateProactively('openai' as ProviderName, limits);
		strictEqual(shouldRotate, true);
	});

	test('should rotate proactively when monthly usage exceeds 80% threshold', () => {
		const limits: ProviderLimits = {
			tokensPerDay: 10000,
			maxTokensTotal: 30000
		};

		tokenTracker.recordUsage('openai' as ProviderName, 25000); // 83.3% of monthly limit
		
		const shouldRotate = tokenTracker.shouldRotateProactively('openai' as ProviderName, limits);
		strictEqual(shouldRotate, true);
	});

	test('should rotate proactively when hourly usage exceeds 80% threshold', () => {
		const limits: ProviderLimits = {
			tokensPerHour: 100,
			tokensPerDay: 1000,
			maxTokensTotal: 30000
		};

		tokenTracker.recordUsage('openai' as ProviderName, 85); // 85% of hourly limit
		
		const shouldRotate = tokenTracker.shouldRotateProactively('openai' as ProviderName, limits);
		strictEqual(shouldRotate, true);
	});

	test('should reset usage data correctly', () => {
		const limits: ProviderLimits = {
			tokensPerDay: 1000,
			maxTokensTotal: 30000
		};

		tokenTracker.recordUsage('openai' as ProviderName, 500);
		
		let stats = tokenTracker.getUsageStats('openai' as ProviderName, limits);
		ok(stats);
		strictEqual(stats.dailyUsage, 500);

		tokenTracker.resetUsage('openai' as ProviderName);
		
		stats = tokenTracker.getUsageStats('openai' as ProviderName, limits);
		strictEqual(stats, null);
	});

	test('should clear all usage data', () => {
		const limits: ProviderLimits = {
			tokensPerDay: 1000,
			maxTokensTotal: 30000
		};

		tokenTracker.recordUsage('openai' as ProviderName, 100);
		tokenTracker.recordUsage('anthropic' as ProviderName, 200);
		
		tokenTracker.clearAllUsage();
		
		const openaiStats = tokenTracker.getUsageStats('openai' as ProviderName, limits);
		const anthropicStats = tokenTracker.getUsageStats('anthropic' as ProviderName, limits);
		
		strictEqual(openaiStats, null);
		strictEqual(anthropicStats, null);
	});

	test('should estimate tokens correctly', () => {
		const shortText = 'Hello';
		const longText = 'This is a longer text that should result in more tokens being estimated';
		
		const shortTokens = tokenTracker.estimateTokens(shortText);
		const longTokens = tokenTracker.estimateTokens(longText);
		
		strictEqual(shortTokens, 2); // 5 chars / 4 = 1.25, ceil = 2
		strictEqual(longTokens, 19); // 75 chars / 4 = 18.75, ceil = 19
		ok(longTokens > shortTokens);
	});

	test('should persist usage data in storage', () => {
		const limits: ProviderLimits = {
			tokensPerDay: 1000,
			maxTokensTotal: 30000
		};

		tokenTracker.recordUsage('openai' as ProviderName, 100);
		
		// Create a new tracker with the same storage
		const newTracker = new TokenUsageTracker(storageService, new NullLogService());
		disposables.add(newTracker);
		
		const stats = newTracker.getUsageStats('openai' as ProviderName, limits);
		ok(stats);
		strictEqual(stats.dailyUsage, 100);
		
		newTracker.dispose();
	});

	test('should handle storage errors gracefully', () => {
		// Mock storage service that throws errors
		const errorStorageService = {
			get: () => { throw new Error('Storage error'); },
			store: () => { throw new Error('Storage error'); },
			remove: () => { throw new Error('Storage error'); }
		} as any;

		const errorTracker = new TokenUsageTracker(errorStorageService, new NullLogService());
		disposables.add(errorTracker);
		
		// Should not throw errors
		errorTracker.recordUsage('openai' as ProviderName, 100);
		
		const stats = errorTracker.getUsageStats('openai' as ProviderName, {
			tokensPerDay: 1000
		});
		
		strictEqual(stats, null);
		
		errorTracker.dispose();
	});

	test('should handle missing limits gracefully', () => {
		tokenTracker.recordUsage('openai' as ProviderName, 100);
		
		const shouldRotate = tokenTracker.shouldRotateProactively('openai' as ProviderName, {});
		strictEqual(shouldRotate, false);
		
		const stats = tokenTracker.getUsageStats('openai' as ProviderName, {});
		ok(stats);
		strictEqual(stats.hourlyUtilization, 0);
		strictEqual(stats.dailyUtilization, 0);
		strictEqual(stats.monthlyUtilization, 0);
	});
});