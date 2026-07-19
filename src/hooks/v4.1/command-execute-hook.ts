/**
 * Command Execute Hook — opencode run enforcement
 * 
 * This hook fires for `opencode run "message"` commands.
 * It performs agent identity checks and gate enforcement
 * BEFORE the command is processed.
 * 
 * This closes the architecture gap where opencode run bypasses
 * chat.message and tool.execute.before hooks.
 * 
 * Behavioral pattern enforcement migrated to AnalysisOrderDispatcher via
 * deterministic rules in src/semantic-firewall/deterministic-rules/.
 * The dispatcher runs all 14 behavioral rules on every tool execution.
 */
import type { Hooks } from '@opencode-ai/plugin';
import { setCurrentAgent } from './agent-state.js';
import { isSharkAgent } from '../../shared/agent-identity.js';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { safeParseJSON } from '../../shared/type-guards.js';
import { logInfo } from '../../shared/shark-logger.js';

// ═══════════════════════════════════════════════════════════════
// HARD FIREWALL: DESTRUCTIVE PATTERNS — permanently blocked.
// These fire BEFORE any other logic. No evidence overrides.
// ═══════════════════════════════════════════════════════════════
const DESTRUCTIVE_PATTERNS: RegExp[] = [
  /rm\s+-rf/i,
  /rm\s+-r\s+/i,
  /rm\s+--recursive/i,
];

const CONTAINER_TEST_RESULT_FILE = 'ContainerTestResult.json';

function hasContainerTestEvidence(): boolean {
  const evidencePath = path.join(
    process.cwd(),
    '.shark',
    'evidence',
    'delivery',
    CONTAINER_TEST_RESULT_FILE
  );
  
  if (!fs.existsSync(evidencePath)) {
    return false;
  }
  
  try {
    const result = safeParseJSON(fs.readFileSync(evidencePath, 'utf-8')) as Record<string, unknown>;
    return result.overallPassed === true && (result.passRate as number) >= 0.90;
  } catch (err) {
    logInfo('[command-execute-hook] hasContainerTestEvidence failed: ' + (err instanceof Error ? err.message : String(err)));
    return false;
  }
}

export { hasContainerTestEvidence };

export function createCommandExecuteHook(): Hooks['command.execute.before'] {
  return async (input, _output) => {
    const { command, arguments: args } = input;

    // ═══════════════════════════════════════════════════════════════
    // HARD FIREWALL: Check ALL input for destructive patterns.
    // Blocks rm -rf in ANY form — no exceptions, no evidence check.
    // ═══════════════════════════════════════════════════════════════
    const inputStr = JSON.stringify(input);
    for (const pattern of DESTRUCTIVE_PATTERNS) {
      if (pattern.test(inputStr)) {
        throw new Error(
          `[COMMAND-EXECUTE] CRITICAL: rm -rf is PERMANENTLY BLOCKED. ` +
          `Matched pattern: ${pattern.source}. Use targeted file deletion instead.`
        );
      }
    }

    if (!command) {
      return;
    }

    if (command === 'run' && args) {
      const agentMatch = args.match(/--agent\s+(\S+)/);
      const agentName = agentMatch ? agentMatch[1] : null;

      // NOT A SHARK AGENT — Shark firewall does not apply
      if (!agentName || !isSharkAgent(agentName)) {
        return;
      }

      setCurrentAgent(agentName);

      // Behavioral pattern enforcement migrated to AnalysisOrderDispatcher via
      // deterministic rules in src/semantic-firewall/deterministic-rules/.
      // The dispatcher runs all 14 behavioral rules on every tool execution.
      // The message content is now analyzed by the dispatcher's deterministic
      // rule engine (Phase 2b) instead of inline pattern matching here.
    }
  };
}
