/**
 * Agent Identity — shark shared
 *
 * Distinguishes shark agents from vanilla and other plugin agents.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const VANILLA_AGENTS = new Set(['plan', 'build', 'general', 'explore']);

const SHARK_AGENTS = new Set(['shark']);
const SHARK_PREFIX = 'shark_';
const SHARK_HYBRID_PREFIX = 'shark-';

/**
 * Check if agent is a Shark agent
 */
export function isSharkAgent(agentName: string | undefined): boolean {
  if (!agentName) return false;
  if (SHARK_AGENTS.has(agentName)) return true;
  if (agentName.startsWith(SHARK_PREFIX)) return true;
  if (agentName.startsWith(SHARK_HYBRID_PREFIX)) return true;
  return false;
}

/**
 * Should enforcement logic fire for this agent?
 * SHARK agents: YES — full enforcement applies.
 * Non-SHARK agents: NO — pass through silently.
 * Empty/null/undefined agents: NO — critical to prevent enforcement on unresolved sessions.
 * USE THIS EVERYWHERE. Do not inline agent-guard logic.
 */
export function shouldEnforceForAgent(agentName: string | null | undefined): boolean {
  if (!agentName) {
    // Check if shark gate state exists — if so, enforce regardless.
    // This catches cases where agent identity is unresolved but the plugin
    // is active (gate-state.json on disk proves shark is managing this session).
    try {
      const gateStatePath = path.join(process.cwd(), '.shark', 'gate-state.json');
      if (fs.existsSync(gateStatePath)) return true;
    } catch { /* non-fatal */ }
    return false;
  }
  return isSharkAgent(agentName);
}

/**
 * Check if agent is a vanilla OpenCode agent
 */
export function isVanillaAgent(agentName: string | undefined): boolean {
  return VANILLA_AGENTS.has(agentName ?? '');
}

/**
 * Check if agent belongs to another plugin
 */
export function isOtherPluginAgent(agentName: string | undefined): boolean {
  if (!agentName) return false;
  return !VANILLA_AGENTS.has(agentName) && !isSharkAgent(agentName);
}