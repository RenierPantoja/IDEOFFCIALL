/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, ok, strictEqual } from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { VoidSettingsService } from '../../common/voidSettingsService.js';
import { ProviderName, VoidSettings, ProviderLimits } from '../../common/voidSettingsTypes.js';

suite('Key Rotation Integration', () => {
	let storageService: InMemoryStorageService;
	let settingsService: VoidSettingsService;
	const disposables = new DisposableStore();

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		storageService = new InMemoryStorageService();
		settingsService = new VoidSettingsService(storageService);
		disposables.add(settingsService);
	});

	teardown(() => {
		disposables.clear();
	});

	test('should rotate to next key when current key exceeds limits', () => {
		const settings: VoidSettings = {
			providers: {
				openai: {
					apiKeys: ['key1', 'key2', 'key3'],
					currentKeyIndex: 0,
					limits: {
						dailyTokenLimit: 1000,
						monthlyTokenLimit: 30000
					}
				}
			}
		};

		settingsService.updateSettings(settings);

		// Simulate heavy usage on first key
		settingsService.recordTokenUsage('openai' as ProviderName, 850); // 85% of daily limit

		// Check if rotation is needed
		const shouldRotate = settingsService.shouldRotateProactively('openai' as ProviderName);
		strictEqual(shouldRotate, true);

		// Perform rotation
		const rotated = settingsService.rotateToNextKey('openai' as ProviderName);
		strictEqual(rotated, true);

		// Verify new key index
		const currentSettings = settingsService.getSettings();
		strictEqual(currentSettings.providers.openai?.currentKeyIndex, 1);
	});

	test('should handle rotation when all keys are exhausted', () => {
		const settings: VoidSettings = {
			providers: {
				openai: {
					apiKeys: ['key1', 'key2'],
					currentKeyIndex: 0,
					limits: {
						dailyTokenLimit: 1000,
						monthlyTokenLimit: 30000
					}
				}
			}
		};

		settingsService.updateSettings(settings);

		// Exhaust first key
		settingsService.recordTokenUsage('openai' as ProviderName, 850);
		let rotated = settingsService.rotateToNextKey('openai' as ProviderName);
		strictEqual(rotated, true);

		// Exhaust second key
		settingsService.recordTokenUsage('openai' as ProviderName, 850);
		rotated = settingsService.rotateToNextKey('openai' as ProviderName);
		strictEqual(rotated, false); // No more keys available

		// Verify we're still on the last key
		const currentSettings = settingsService.getSettings();
		strictEqual(currentSettings.providers.openai?.currentKeyIndex, 1);
	});

	test('should track usage separately for different providers', () => {
		const settings: VoidSettings = {
			providers: {
				openai: {
					apiKeys: ['openai-key1', 'openai-key2'],
					currentKeyIndex: 0,
					limits: {
						dailyTokenLimit: 1000,
						monthlyTokenLimit: 30000
					}
				},
				anthropic: {
					apiKeys: ['anthropic-key1', 'anthropic-key2'],
					currentKeyIndex: 0,
					limits: {
						dailyTokenLimit: 2000,
						monthlyTokenLimit: 60000
					}
				}
			}
		};

		settingsService.updateSettings(settings);

		// Use tokens on both providers
		settingsService.recordTokenUsage('openai' as ProviderName, 500);
		settingsService.recordTokenUsage('anthropic' as ProviderName, 1000);

		// Check usage stats
		const openaiStats = settingsService.getTokenUsageStats('openai' as ProviderName);
		const anthropicStats = settingsService.getTokenUsageStats('anthropic' as ProviderName);

		ok(openaiStats);
		ok(anthropicStats);
		strictEqual(openaiStats.dailyUsage, 500);
		strictEqual(anthropicStats.dailyUsage, 1000);

		// OpenAI should not need rotation (50% usage)
		const openaiShouldRotate = settingsService.shouldRotateProactively('openai' as ProviderName);
		strictEqual(openaiShouldRotate, false);

		// Anthropic should not need rotation (50% usage)
		const anthropicShouldRotate = settingsService.shouldRotateProactively('anthropic' as ProviderName);
		strictEqual(anthropicShouldRotate, false);
	});

	test('should handle hourly limits correctly', () => {
		const settings: VoidSettings = {
			providers: {
				openai: {
					apiKeys: ['key1', 'key2'],
					currentKeyIndex: 0,
					limits: {
						hourlyTokenLimit: 100,
						dailyTokenLimit: 1000,
						monthlyTokenLimit: 30000
					}
				}
			}
		};

		settingsService.updateSettings(settings);

		// Exceed hourly limit
		settingsService.recordTokenUsage('openai' as ProviderName, 85); // 85% of hourly limit

		const shouldRotate = settingsService.shouldRotateProactively('openai' as ProviderName);
		strictEqual(shouldRotate, true);

		const stats = settingsService.getTokenUsageStats('openai' as ProviderName);
		ok(stats);
		strictEqual(stats.hourlyUtilization, 85);
	});

	test('should reset usage data correctly', () => {
		const settings: VoidSettings = {
			providers: {
				openai: {
					apiKeys: ['key1'],
					currentKeyIndex: 0,
					limits: {
						dailyTokenLimit: 1000,
						monthlyTokenLimit: 30000
					}
				}
			}
		};

		settingsService.updateSettings(settings);

		// Track some usage
		settingsService.recordTokenUsage('openai' as ProviderName, 500);

		let stats = settingsService.getTokenUsageStats('openai' as ProviderName);
		ok(stats);
		strictEqual(stats.dailyUsage, 500);

		// Reset usage
		settingsService.resetTokenUsage('openai' as ProviderName);

		stats = settingsService.getTokenUsageStats('openai' as ProviderName);
		strictEqual(stats, null);
	});

	test('should handle multiple rapid rotations', () => {
		const settings: VoidSettings = {
			providers: {
				openai: {
					apiKeys: ['key1', 'key2', 'key3', 'key4', 'key5'],
					currentKeyIndex: 0,
					limits: {
						dailyTokenLimit: 100, // Very low limit for testing
						monthlyTokenLimit: 3000
					}
				}
			}
		};

		settingsService.updateSettings(settings);

		// Rapidly exhaust keys
		for (let i = 0; i < 4; i++) {
			settingsService.recordTokenUsage('openai' as ProviderName, 85);
			const shouldRotate = settingsService.shouldRotateProactively('openai' as ProviderName);
			strictEqual(shouldRotate, true);
			
			if (i < 3) { // Don't rotate on the last iteration
				const rotated = settingsService.rotateToNextKey('openai' as ProviderName);
				strictEqual(rotated, true);
			}
		}

		// Verify we're on the last key
		const currentSettings = settingsService.getSettings();
		strictEqual(currentSettings.providers.openai?.currentKeyIndex, 4);

		// Try to rotate one more time - should fail
		const finalRotation = settingsService.rotateToNextKey('openai' as ProviderName);
		strictEqual(finalRotation, false);
	});

	test('should handle edge case with single key', () => {
		const settings: VoidSettings = {
			providers: {
				openai: {
					apiKeys: ['single-key'],
					currentKeyIndex: 0,
					limits: {
						dailyTokenLimit: 1000,
						monthlyTokenLimit: 30000
					}
				}
			}
		};

		settingsService.updateSettings(settings);

		// Exceed limits on single key
		settingsService.recordTokenUsage('openai' as ProviderName, 850);

		const shouldRotate = settingsService.shouldRotateProactively('openai' as ProviderName);
		strictEqual(shouldRotate, true);

		// Try to rotate - should fail since there's only one key
		const rotated = settingsService.rotateToNextKey('openai' as ProviderName);
		strictEqual(rotated, false);

		// Verify we're still on the same key
		const currentSettings = settingsService.getSettings();
		strictEqual(currentSettings.providers.openai?.currentKeyIndex, 0);
	});

	test('should handle provider without limits', () => {
		const settings: VoidSettings = {
			providers: {
				openai: {
					apiKeys: ['key1', 'key2'],
					currentKeyIndex: 0
					// No limits defined
				}
			}
		};

		settingsService.updateSettings(settings);

		// Track usage without limits
		settingsService.recordTokenUsage('openai' as ProviderName, 1000000);

		// Should not rotate without limits
		const shouldRotate = settingsService.shouldRotateProactively('openai' as ProviderName);
		strictEqual(shouldRotate, false);

		const stats = settingsService.getTokenUsageStats('openai' as ProviderName);
		ok(stats);
		strictEqual(stats.dailyUsage, 1000000);
		strictEqual(stats.dailyUtilization, 0); // No limit = 0% utilization
	});

	test('should persist rotation state across service restarts', () => {
		const settings: VoidSettings = {
			providers: {
				openai: {
					apiKeys: ['key1', 'key2', 'key3'],
					currentKeyIndex: 0,
					limits: {
						dailyTokenLimit: 1000,
						monthlyTokenLimit: 30000
					}
				}
			}
		};

		settingsService.updateSettings(settings);

		// Track usage and rotate
		settingsService.recordTokenUsage('openai' as ProviderName, 850);
		settingsService.rotateToNextKey('openai' as ProviderName);

		// Create new service with same storage
		const newSettingsService = new VoidSettingsService(storageService);
		disposables.add(newSettingsService);

		// Verify state is preserved
		const currentSettings = newSettingsService.getSettings();
		strictEqual(currentSettings.providers.openai?.currentKeyIndex, 1);

		const stats = newSettingsService.getTokenUsageStats('openai' as ProviderName);
		ok(stats);
		strictEqual(stats.dailyUsage, 850);

		newSettingsService.dispose();
	});
});