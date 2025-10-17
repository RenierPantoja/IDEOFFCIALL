/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { ProviderName, ProviderLimits } from './voidSettingsTypes.js';

/**
 * Default limits configuration for each provider
 * These are based on official API documentation and common usage patterns
 */
export const defaultProviderLimits: Record<ProviderName, ProviderLimits> = {
	openAI: {
		tokensPerMinute: 200000, // GPT-4 tier 1
		tokensPerDay: 10000000,
		requestsPerMinute: 500,
		resetWindowHours: 24,
		proactiveThreshold: 0.95 // rotate at 95% of limit
	},
	anthropic: {
		tokensPerMinute: 40000, // Claude tier 1
		tokensPerDay: 1000000,
		requestsPerMinute: 50,
		resetWindowHours: 24,
		proactiveThreshold: 0.95
	},
	gemini: {
		tokensPerMinute: 32000, // Gemini Pro
		tokensPerDay: 1000000, // 1M tokens per day
		requestsPerMinute: 60,
		resetWindowHours: 24,
		proactiveThreshold: 0.95 // rotate at 950k tokens as requested
	},
	deepseek: {
		tokensPerMinute: 60000,
		tokensPerDay: 5000000,
		requestsPerMinute: 100,
		resetWindowHours: 24,
		proactiveThreshold: 0.95
	},
	xAI: {
		tokensPerMinute: 20000,
		tokensPerDay: 1000000,
		requestsPerMinute: 50,
		resetWindowHours: 24,
		proactiveThreshold: 0.95
	},
	mistral: {
		tokensPerMinute: 20000,
		tokensPerDay: 1000000,
		requestsPerMinute: 50,
		resetWindowHours: 24,
		proactiveThreshold: 0.95
	},
	groq: {
		tokensPerMinute: 30000,
		tokensPerDay: 14400, // very limited free tier
		requestsPerMinute: 30,
		resetWindowHours: 24,
		proactiveThreshold: 0.90 // more aggressive due to low limits
	},
	openRouter: {
		tokensPerMinute: 200000, // varies by model
		tokensPerDay: 10000000,
		requestsPerMinute: 200,
		resetWindowHours: 24,
		proactiveThreshold: 0.95
	},
	// Local providers typically don't have API limits
	ollama: {
		proactiveThreshold: 1.0 // no rotation needed
	},
	vLLM: {
		proactiveThreshold: 1.0 // no rotation needed
	},
	lmStudio: {
		proactiveThreshold: 1.0 // no rotation needed
	},
	liteLLM: {
		tokensPerMinute: 100000, // depends on underlying provider
		tokensPerDay: 5000000,
		requestsPerMinute: 100,
		resetWindowHours: 24,
		proactiveThreshold: 0.95
	},
	openAICompatible: {
		tokensPerMinute: 100000, // generic defaults
		tokensPerDay: 5000000,
		requestsPerMinute: 100,
		resetWindowHours: 24,
		proactiveThreshold: 0.95
	},
	googleVertex: {
		tokensPerMinute: 32000,
		tokensPerDay: 1000000,
		requestsPerMinute: 60,
		resetWindowHours: 24,
		proactiveThreshold: 0.95
	},
	microsoftAzure: {
		tokensPerMinute: 200000,
		tokensPerDay: 10000000,
		requestsPerMinute: 500,
		resetWindowHours: 24,
		proactiveThreshold: 0.95
	},
	awsBedrock: {
		tokensPerMinute: 40000,
		tokensPerDay: 1000000,
		requestsPerMinute: 50,
		resetWindowHours: 24,
		proactiveThreshold: 0.95
	}
};

/**
 * Get the effective limits for a provider, merging defaults with user overrides
 */
export function getEffectiveProviderLimits(providerName: ProviderName, userLimits?: ProviderLimits): ProviderLimits {
	const defaults = defaultProviderLimits[providerName];
	if (!userLimits) {
		return defaults;
	}
	
	return {
		...defaults,
		...userLimits
	};
}

/**
 * Check if a provider should use token-based rotation
 */
export function shouldTrackTokens(providerName: ProviderName): boolean {
	const limits = defaultProviderLimits[providerName];
	return !!(limits.tokensPerMinute || limits.tokensPerHour || limits.tokensPerDay || limits.maxTokensTotal);
}