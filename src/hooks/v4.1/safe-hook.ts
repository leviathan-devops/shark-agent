/**
 * Safe Hook Utility - Shark v4.9
 *
 * Wraps hook functions with agent filtering to prevent global spillover.
 * Based on Trident's safeHook pattern from plugin engineering master context.
 *
 * CRITICAL: All hooks MUST be wrapped to prevent firing for wrong agents.
 */

import type { Hooks } from '@opencode-ai/plugin';
import { isRecord, safeGetString, safeGetRecord } from '../../shared/type-guards.js';

const HOOK_EXECUTION_TIMEOUT_MS = 5000;

export interface SafeHookOptions {
  agentFilter?: string[];
  requiredPhase?: string | null;
  timeout?: number;
  pluginName?: string;
  managedAgents?: Set<string>;
  agentPrefix?: string;
  orchestratorName?: string;
}

export interface HookContext {
  isMyAgent: (agentName: string) => boolean;
  agentName: string;
}

function createAgentAwareness(
  managedAgents: Set<string>,
  agentPrefix: string,
  orchestratorName: string
) {
  return {
    isMyAgent(agentName: string | undefined | null): boolean {
      if (!agentName) return false;
      if (managedAgents.has(agentName)) return true;
      if (agentPrefix && agentName.startsWith(agentPrefix)) return true;
      if (agentName === orchestratorName) return true;
      return false;
    }
  };
}

export function safeHook<T extends Hooks[keyof Hooks]>(
  handler: T,
  options: SafeHookOptions
): T {
  const {
    timeout = HOOK_EXECUTION_TIMEOUT_MS,
    pluginName = 'shark-agent',
    managedAgents = new Set(['shark', 'shark-agent', 'shark_beta', 'shark_gamma']),
    agentPrefix = 'shark-',
    orchestratorName = 'shark',
  } = options;

  const awareness = createAgentAwareness(managedAgents, agentPrefix, orchestratorName);

  return (async (input: Record<string, unknown>, output: Record<string, unknown>) => {
    const inputSafe = isRecord(input) ? input : {};
    const session = safeGetRecord(inputSafe, 'session');
    const agentName = safeGetString(session, 'agentName') || safeGetString(inputSafe, 'agentName') || safeGetString(inputSafe, 'agent') || '';

    if (!awareness.isMyAgent(agentName)) {
      return;
    }

    const startTime = Date.now();
    try {
      await Promise.race([
        (handler as unknown as (input: Record<string, unknown>, output: Record<string, unknown>, ctx: HookContext) => Promise<void>)(input, output, { isMyAgent: awareness.isMyAgent, agentName }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Hook timeout after ${timeout}ms`)), timeout)
        )
      ]);
    } catch (_err) {
      // Non-critical hook error — no console spillover
      // Errors are transient and do not affect agent operation
    }
  }) as T;
}