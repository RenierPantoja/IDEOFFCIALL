/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok, strictEqual } from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { VoidSettingsService } from '../../common/voidSettingsService.js';
import { ProviderName } from '../../common/voidSettingsTypes.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';

// Mock encryption service
class MockEncryptionService {
	_serviceBrand: undefined;
	async encrypt(value: string): Promise<string> { return value; }
	async decrypt(value: string): Promise<string> { return value; }
	async isEncryptionAvailable(): Promise<boolean> { return false; }
	async setUsePlainTextEncryption(): Promise<void> { return; }
	async getKeyStorageProvider(): Promise<any> { return 'basicText'; }
}

// Mock metrics service
class MockMetricsService {
	recordEvent() {}
	recordTiming() {}
}

suite('Key Rotation Integration', () => {
	let storageService: InMemoryStorageService;
	let settingsService: VoidSettingsService;
	const disposables = new DisposableStore();

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		storageService = new InMemoryStorageService();
		settingsService = new VoidSettingsService(
			storageService,
			new MockEncryptionService() as any,
			new MockMetricsService() as any,
			new NullLogService()
		);
		disposables.add(settingsService);
	});

	teardown(() => {
		disposables.clear();
	});

	test('should rotate to next key when current key exceeds limits', async () => {
		// Add API keys first
		await settingsService.addApiKey('openai' as ProviderName, 'key1');
		await settingsService.addApiKey('openai' as ProviderName, 'key2');
		await settingsService.addApiKey('openai' as ProviderName, 'key3');
		
		// Set limits
		await settingsService.setSettingOfProvider('openai' as ProviderName, 'providerLimits', {
			tokensPerDay: 1000,
			maxTokensTotal: 30000
		});

		// Simulate heavy usage on first key
		await settingsService.recordTokenUsage('openai' as ProviderName, 850); // 85% of daily limit

		// Check if rotation is needed
		const shouldRotate = await settingsService.shouldRotateProactively('openai' as ProviderName);
		strictEqual(shouldRotate, true);

		// Perform rotation
		await settingsService.rotateToNextApiKey('openai' as ProviderName);

		// Verify new key index
		const currentSettings = settingsService.state;
		strictEqual(currentSettings.settingsOfProvider.openAI?.currentKeyIndex, 1);
	});

	test('should handle rotation when all keys are exhausted', async () => {
		// Add API keys
		await settingsService.addApiKey('openai' as ProviderName, 'key1');
		await settingsService.addApiKey('openai' as ProviderName, 'key2');
		
		// Set limits
		await settingsService.setSettingOfProvider('openai' as ProviderName, 'providerLimits', {
			tokensPerDay: 1000,
			maxTokensTotal: 30000
		});

		// Exhaust first key
		await settingsService.recordTokenUsage('openai' as ProviderName, 850);
		await settingsService.rotateToNextApiKey('openai' as ProviderName);

		// Exhaust second key
		await settingsService.recordTokenUsage('openai' as ProviderName, 850);
		await settingsService.rotateToNextApiKey('openai' as ProviderName);

		// Verify we're still on the last key (rotation should wrap around or stay)
		const currentSettings = settingsService.state;
		ok(currentSettings.settingsOfProvider.openAI?.currentKeyIndex !== undefined);
	});

	test('should track usage separately for different providers', async () => {
		// Add API keys for both providers
		await settingsService.addApiKey('openai' as ProviderName, 'openai-key1');
		await settingsService.addApiKey('openai' as ProviderName, 'openai-key2');
		await settingsService.addApiKey('anthropic' as ProviderName, 'anthropic-key1');
		await settingsService.addApiKey('anthropic' as ProviderName, 'anthropic-key2');
		
		// Set limits for both providers
		await settingsService.setSettingOfProvider('openai' as ProviderName, 'providerLimits', {
			tokensPerDay: 1000,
			maxTokensTotal: 30000
		});
		await settingsService.setSettingOfProvider('anthropic' as ProviderName, 'providerLimits', {
			tokensPerDay: 2000,
			maxTokensTotal: 60000
		});

		// Use tokens on both providers
		await settingsService.recordTokenUsage('openai' as ProviderName, 500);
		await settingsService.recordTokenUsage('anthropic' as ProviderName, 1000);

		// Check usage stats
		const openaiStats = await settingsService.getTokenUsageStats('openai' as ProviderName);
		const anthropicStats = await settingsService.getTokenUsageStats('anthropic' as ProviderName);

		ok(openaiStats);
		ok(anthropicStats);
		strictEqual(openaiStats.dailyUsage, 500);
		strictEqual(anthropicStats.dailyUsage, 1000);

		// OpenAI should not need rotation (50% usage)
		const openaiShouldRotate = await settingsService.shouldRotateProactively('openai' as ProviderName);
		strictEqual(openaiShouldRotate, false);

		// Anthropic should not need rotation (50% usage)
		const anthropicShouldRotate = await settingsService.shouldRotateProactively('anthropic' as ProviderName);
		strictEqual(anthropicShouldRotate, false);
	});

	test('should handle hourly limits correctly', async () => {
		// Add API keys
		await settingsService.addApiKey('openai' as ProviderName, 'key1');
		await settingsService.addApiKey('openai' as ProviderName, 'key2');
		
		// Set limits with hourly limit
		await settingsService.setSettingOfProvider('openai' as ProviderName, 'providerLimits', {
			tokensPerHour: 100,
			tokensPerDay: 1000,
			maxTokensTotal: 30000
		});

		// Exceed hourly limit
		await settingsService.recordTokenUsage('openai' as ProviderName, 85); // 85% of hourly limit

		const shouldRotate = await settingsService.shouldRotateProactively('openai' as ProviderName);
		strictEqual(shouldRotate, true);

		const stats = await settingsService.getTokenUsageStats('openai' as ProviderName);
		ok(stats);
		strictEqual(stats.hourlyUtilization, 0.85); // 85/100 = 0.85
	});

	test('should reset usage data correctly', async () => {
		// Add API key
		await settingsService.addApiKey('openai' as ProviderName, 'key1');
		
		// Set limits
		await settingsService.setSettingOfProvider('openai' as ProviderName, 'providerLimits', {
			tokensPerDay: 1000,
			maxTokensTotal: 30000
		});

		// Track some usage
		await settingsService.recordTokenUsage('openai' as ProviderName, 500);

		let stats = await settingsService.getTokenUsageStats('openai' as ProviderName);
		ok(stats);
		strictEqual(stats.dailyUsage, 500);

		// Reset usage
		await settingsService.resetTokenUsage('openai' as ProviderName);

		stats = await settingsService.getTokenUsageStats('openai' as ProviderName);
		strictEqual(stats, null);
	});

	test('should handle multiple rapid rotations', async () => {
		// Add multiple API keys
		await settingsService.addApiKey('openai' as ProviderName, 'key1');
		await settingsService.addApiKey('openai' as ProviderName, 'key2');
		await settingsService.addApiKey('openai' as ProviderName, 'key3');
		await settingsService.addApiKey('openai' as ProviderName, 'key4');
		await settingsService.addApiKey('openai' as ProviderName, 'key5');
		
		// Set very low limits for testing
		await settingsService.setSettingOfProvider('openai' as ProviderName, 'providerLimits', {
			tokensPerDay: 100, // Very low limit for testing
			maxTokensTotal: 3000
		});

		// Rapidly exhaust keys
		for (let i = 0; i < 4; i++) {
			await settingsService.recordTokenUsage('openai' as ProviderName, 85);
			const shouldRotate = await settingsService.shouldRotateProactively('openai' as ProviderName);
			strictEqual(shouldRotate, true);
			
			if (i < 3) { // Don't rotate on the last iteration
				await settingsService.rotateToNextApiKey('openai' as ProviderName);
			}
		}

		// Verify we're on a valid key
		const currentSettings = settingsService.state;
		ok(currentSettings.settingsOfProvider.openAI?.currentKeyIndex !== undefined);
		ok(currentSettings.settingsOfProvider.openAI?.currentKeyIndex! >= 0);
		ok(currentSettings.settingsOfProvider.openAI?.currentKeyIndex! < 5);
	});

	test('should handle edge case with single key', async () => {
		// Add single API key
		await settingsService.addApiKey('openai' as ProviderName, 'single-key');
		
		// Set limits
		await settingsService.setSettingOfProvider('openai' as ProviderName, 'providerLimits', {
			tokensPerDay: 1000,
			maxTokensTotal: 30000
		});

		// Exceed limits on single key
		await settingsService.recordTokenUsage('openai' as ProviderName, 850);

		const shouldRotate = await settingsService.shouldRotateProactively('openai' as ProviderName);
		strictEqual(shouldRotate, true);

		// Try to rotate - should not fail but may not change index
		await settingsService.rotateToNextApiKey('openai' as ProviderName);

		// Verify we're still on a valid key
		const currentSettings = settingsService.state;
		strictEqual(currentSettings.settingsOfProvider.openAI?.currentKeyIndex, 0);
	});

	test('should handle provider without limits', async () => {
		// Add API keys
		await settingsService.addApiKey('openai' as ProviderName, 'key1');
		await settingsService.addApiKey('openai' as ProviderName, 'key2');

		// Track usage without limits
		await settingsService.recordTokenUsage('openai' as ProviderName, 1000000);

		// Should not rotate without limits
		const shouldRotate = await settingsService.shouldRotateProactively('openai' as ProviderName);
		strictEqual(shouldRotate, false);

		const stats = await settingsService.getTokenUsageStats('openai' as ProviderName);
		ok(stats);
		strictEqual(stats.dailyUsage, 1000000);
		strictEqual(stats.dailyUtilization, 0); // No limit = 0% utilization
	});

	test('should persist rotation state across service restarts', async () => {
		// Add API keys
		await settingsService.addApiKey('openai' as ProviderName, 'key1');
		await settingsService.addApiKey('openai' as ProviderName, 'key2');
		await settingsService.addApiKey('openai' as ProviderName, 'key3');
		
		// Set limits
		await settingsService.setSettingOfProvider('openai' as ProviderName, 'providerLimits', {
			tokensPerDay: 1000,
			maxTokensTotal: 30000
		});

		// Track usage and rotate
		await settingsService.recordTokenUsage('openai' as ProviderName, 850);
		await settingsService.rotateToNextApiKey('openai' as ProviderName);

		// Create new service with same storage
		const newSettingsService = new VoidSettingsService(
			storageService,
			new MockEncryptionService() as any,
			new MockMetricsService() as any,
			new NullLogService()
		);
		disposables.add(newSettingsService);

		// Wait for initialization
		await newSettingsService.waitForInitState;

		// Verify state is preserved
		const currentSettings = newSettingsService.state;
		strictEqual(currentSettings.settingsOfProvider.openAI?.currentKeyIndex, 1);

		const stats = await newSettingsService.getTokenUsageStats('openai' as ProviderName);
		ok(stats);
		strictEqual(stats.dailyUsage, 850);

		newSettingsService.dispose();
	});
});