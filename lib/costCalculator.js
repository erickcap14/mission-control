/**
 * Cost calculation utilities for Claude Code session analytics.
 */

const MODEL_ALIASES = {
  opus: null,    // resolved dynamically to first opus key
  sonnet: null,  // resolved dynamically to first sonnet key
  haiku: null,   // resolved dynamically to first haiku key
};

/**
 * Normalizes a raw model string to a canonical pricing key.
 * e.g. "claude-sonnet-4-5-20241022" → "claude-sonnet-4-5"
 * e.g. "sonnet" → "claude-sonnet-4-6" (first sonnet match in config)
 * @param {string} modelStr
 * @param {object} [pricingKeys] - optional array of known keys to match against
 * @returns {string}
 */
export function normalizeModel(modelStr, pricingKeys = []) {
  if (!modelStr) return 'claude-sonnet-4-6';

  const lower = modelStr.toLowerCase().trim();

  // Direct match
  if (pricingKeys.includes(lower)) return lower;

  // Short alias: fable / opus / sonnet / haiku
  for (const alias of ['fable', 'opus', 'sonnet', 'haiku']) {
    if (lower === alias) {
      const match = pricingKeys.find(k => k.includes(alias));
      return match || `claude-${alias}-4-6`;
    }
  }

  // Substring match: try each known key and see if modelStr contains the key
  // Sort by length desc so more specific keys match first
  const sorted = [...pricingKeys].sort((a, b) => b.length - a.length);
  for (const key of sorted) {
    if (lower.includes(key)) return key;
  }

  // Partial family match: find the key whose family segment appears in modelStr
  // e.g. "claude-sonnet-4-5-20241022" → look for "sonnet" in known keys
  for (const family of ['fable', 'opus', 'sonnet', 'haiku']) {
    if (lower.includes(family)) {
      const match = pricingKeys.find(k => k.includes(family));
      if (match) return match;
    }
  }

  // Fallback to sonnet
  return 'claude-sonnet-4-6';
}

/**
 * Returns pricing object {input, output, cacheRead, cacheWrite} in $/M tokens.
 * Falls back to sonnet pricing if unknown model.
 * @param {string} modelKey
 * @param {object} config
 * @returns {{ input: number, output: number, cacheRead: number, cacheWrite: number }}
 */
export function getPricing(modelKey, config) {
  const pricing = config?.pricing || {};

  if (pricing[modelKey]) return pricing[modelKey];

  // Try normalizing with available keys
  const keys = Object.keys(pricing);
  const normalized = normalizeModel(modelKey, keys);
  if (pricing[normalized]) return pricing[normalized];

  // Fallback to first sonnet key or hard-coded defaults
  const sonnetKey = keys.find(k => k.includes('sonnet'));
  if (sonnetKey) return pricing[sonnetKey];

  return { input: 3, output: 15, cacheRead: 0.30, cacheWrite: 3.75 };
}

/**
 * Calculates cost from token counts and pricing.
 * @param {{ input?: number, output?: number, cacheRead?: number, cacheWrite?: number }} tokens
 * @param {string} modelKey
 * @param {object} config
 * @returns {{ total: number, input: number, output: number, cacheRead: number, cacheWrite: number }}
 */
export function calculateCost(tokens, modelKey, config) {
  const p = getPricing(modelKey, config);
  const t = {
    input: tokens?.input || 0,
    output: tokens?.output || 0,
    cacheRead: tokens?.cacheRead || 0,
    cacheWrite: tokens?.cacheWrite || 0,
  };

  const inputCost = (t.input / 1_000_000) * p.input;
  const outputCost = (t.output / 1_000_000) * p.output;
  const cacheReadCost = (t.cacheRead / 1_000_000) * p.cacheRead;
  const cacheWriteCost = (t.cacheWrite / 1_000_000) * p.cacheWrite;

  return {
    total: inputCost + outputCost + cacheReadCost + cacheWriteCost,
    input: inputCost,
    output: outputCost,
    cacheRead: cacheReadCost,
    cacheWrite: cacheWriteCost,
  };
}

/**
 * Calculates hours saved based on session duration and multiplier.
 * @param {number} durationMs - session duration in milliseconds
 * @param {number} multiplier - time saved multiplier (e.g. 2.5)
 * @returns {number} hours saved
 */
export function calculateTimeSaved(durationMs, multiplier) {
  if (!durationMs || durationMs <= 0) return 0;
  return (durationMs / 3_600_000) * (multiplier || 1);
}
