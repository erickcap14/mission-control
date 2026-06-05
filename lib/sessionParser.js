/**
 * Session parser — reads a Claude Code JSONL file and returns a structured session object.
 */

import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import path from 'path';
import { normalizeModel, calculateCost } from './costCalculator.js';

/**
 * Determines the auto-generated summary for a session.
 * @param {Map<string, number>} toolCallMap - tool name → count
 * @param {number} turnCount
 * @returns {string}
 */
function buildSummary(toolCallMap, turnCount) {
  if (toolCallMap.has('Write') || toolCallMap.has('Edit')) {
    return 'Implemented changes in codebase';
  }
  if (toolCallMap.has('WebSearch') || toolCallMap.has('WebFetch')) {
    return 'Researched topic online';
  }
  if (toolCallMap.has('Bash')) {
    return 'Ran commands in terminal';
  }
  if (toolCallMap.has('Read')) {
    return 'Reviewed codebase';
  }
  if (turnCount > 0) {
    return `${turnCount}-turn conversation`;
  }
  return 'Claude Code session';
}

/**
 * Checks whether an event is a sidechain/subagent event.
 * @param {object} event
 * @returns {boolean}
 */
function isSidechainEvent(event) {
  return (
    event.isSidechain === true ||
    (event.parentMessageId != null && event.parentMessageId !== undefined) ||
    (typeof event.type === 'string' && event.type.toLowerCase().includes('subagent'))
  );
}

/**
 * Parses a JSONL session file and returns a session object.
 * @param {string} filePath - absolute path to the .jsonl file
 * @param {object} [config] - optional config for pricing
 * @returns {Promise<object>} session object
 */
export async function parseSession(filePath, config = {}) {
  const sessionId = path.basename(filePath, '.jsonl');

  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const modelCounts = {};
  const toolCallMap = new Map();
  let turnCount = 0;
  let firstTimestamp = null;
  let lastTimestamp = null;
  let subagentCount = 0;
  const subagentModels = {};

  const fileStream = createReadStream(filePath, { encoding: 'utf8' });
  const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let event;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue;
    }

    // Track timestamps
    const ts = event.timestamp
      ? new Date(event.timestamp)
      : event.message?.timestamp
        ? new Date(event.message.timestamp)
        : null;

    if (ts && !isNaN(ts.getTime())) {
      if (!firstTimestamp || ts < firstTimestamp) firstTimestamp = ts;
      if (!lastTimestamp || ts > lastTimestamp) lastTimestamp = ts;
    }

    // Sidechain / subagent detection
    if (isSidechainEvent(event)) {
      subagentCount++;
      const subModel = event.message?.model || event.model;
      if (subModel) {
        const pricingKeys = Object.keys(config?.pricing || {});
        const normalized = normalizeModel(subModel, pricingKeys);
        subagentModels[normalized] = (subagentModels[normalized] || 0) + 1;
      }
    }

    const eventType = event.type;

    if (eventType === 'user') {
      turnCount++;

      // Check content array for tool results (metadata only, no cost tallying needed here)
      const content = event.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          // tool_result blocks in user messages are responses — no tool name to count
        }
      }
    } else if (eventType === 'assistant') {
      const message = event.message || {};

      // Accumulate token usage
      const usage = message.usage || {};
      tokens.input += usage.input_tokens || 0;
      tokens.output += usage.output_tokens || 0;
      tokens.cacheRead += usage.cache_read_input_tokens || 0;
      tokens.cacheWrite += usage.cache_creation_input_tokens || 0;

      // Track model
      const rawModel = message.model || event.model;
      if (rawModel) {
        const pricingKeys = Object.keys(config?.pricing || {});
        const normalized = normalizeModel(rawModel, pricingKeys);
        modelCounts[normalized] = (modelCounts[normalized] || 0) + 1;
      }

      // Scan content for tool_use blocks
      const content = message.content || [];
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.type === 'tool_use' && block.name) {
            toolCallMap.set(block.name, (toolCallMap.get(block.name) || 0) + 1);
          }
        }
      }
    }
    // system events: timestamps already tracked above
  }

  // Determine dominant model
  let dominantModel = 'claude-sonnet-4-6';
  let maxCount = 0;
  for (const [model, count] of Object.entries(modelCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantModel = model;
    }
  }

  const duration =
    firstTimestamp && lastTimestamp
      ? lastTimestamp.getTime() - firstTimestamp.getTime()
      : 0;

  const costBreakdown = calculateCost(tokens, dominantModel, config);
  const cost = costBreakdown.total;

  // Build toolCalls array
  const toolCalls = [];
  for (const [name, count] of toolCallMap.entries()) {
    toolCalls.push({ name, count });
  }
  toolCalls.sort((a, b) => b.count - a.count);

  const summary = buildSummary(toolCallMap, turnCount);

  return {
    id: sessionId,
    filePath,
    model: dominantModel,
    tokens,
    cost,
    costBreakdown,
    duration,
    turnCount,
    toolCalls,
    startTime: firstTimestamp,
    endTime: lastTimestamp,
    summary,
    subagentCount,
    subagentModels,
    status: null,
    projectPath: null,
  };
}
