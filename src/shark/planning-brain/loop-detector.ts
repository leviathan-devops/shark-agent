/**
 * @deprecated Replaced by PSE BehavioralLoopEngine (src/shark/planning-brain/pse/).
 * Loop Detector — Escalation ladder for the Planning Brain
 * 
 * Three loop types:
 *   same-tool: same toolName called consecutively
 *   same-result: tool produces same output hash
 *   no-progress: N tool calls without filesystem change
 * 
 * Escalation stages:
 *   1 loop: context injection (soft reminder)
 *   2 loops: common sense injection (stronger signal)
 *   3+ loops: PSM activation (hard block via StructuredBlockError)
 */

import * as fs from 'node:fs';

export interface LoopState {
  lastToolName: string | null;
  lastResultHash: string | null;
  sameToolCount: number;
  sameResultCount: number;
  noProgressCount: number;
  totalLoopCount: number;
  escalationStage: 0 | 1 | 2 | 3;
  lastFileSystemChange: number;
  lastPatterns: Set<string>;
}

const WRITE_TOOLS = new Set(['write', 'edit', 'write_file', 'patch', 'mkdir', 'delete_file']);

export function createLoopState(): LoopState {
  return {
    lastToolName: null,
    lastResultHash: null,
    sameToolCount: 0,
    sameResultCount: 0,
    noProgressCount: 0,
    totalLoopCount: 0,
    escalationStage: 0,
    lastFileSystemChange: Date.now(),
    lastPatterns: new Set<string>(),
  };
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return hash.toString(36);
}

export function detectLoop(
  state: LoopState,
  toolName: string,
  toolOutput: unknown
): { isLoop: boolean; type: 'same-tool' | 'same-result' | 'no-progress' | null } {
  if (state.lastToolName && toolName !== state.lastToolName) {
    state.sameToolCount = 0;
  }

  state.sameToolCount = state.lastToolName === toolName ? state.sameToolCount + 1 : 0;

  const outputStr = JSON.stringify(toolOutput || '');
  const resultHash = simpleHash(outputStr);
  state.sameResultCount = (state.lastResultHash === resultHash && state.lastToolName === toolName)
    ? state.sameResultCount + 1 : 0;

  if (WRITE_TOOLS.has(toolName)) {
    state.noProgressCount = 0;
    state.lastFileSystemChange = Date.now();
  } else {
    state.noProgressCount++;
  }

  state.lastToolName = toolName;
  state.lastResultHash = resultHash;

  if (state.sameToolCount >= 3) {
    state.totalLoopCount++;
    return { isLoop: true, type: 'same-tool' };
  }
  if (state.sameResultCount >= 2) {
    state.totalLoopCount++;
    return { isLoop: true, type: 'same-result' };
  }
  if (state.noProgressCount >= 10) {
    state.totalLoopCount++;
    return { isLoop: true, type: 'no-progress' };
  }

  return { isLoop: false, type: null };
}

export function getEscalationAction(
  state: LoopState
): { action: 'pass' | 'inject-context' | 'inject-common-sense' | 'block-psm'; message?: string } {
  if (state.noProgressCount === 0 && state.totalLoopCount > 0) {
    state.totalLoopCount = Math.max(0, state.totalLoopCount - 1);
  }

  if (state.totalLoopCount >= 3) {
    state.escalationStage = 3;
    return {
      action: 'block-psm',
      message: `[PSM] ${state.totalLoopCount} loops. STOP. Problem? Known? Tried? Unknown? Investigate.`,
    };
  }
  if (state.totalLoopCount >= 2) {
    state.escalationStage = 2;
    return {
      action: 'inject-common-sense',
      message: `[LOOP] ${state.totalLoopCount}x "${state.lastToolName}". No progress. Read spec.`,
    };
  }
  if (state.totalLoopCount >= 1) {
    state.escalationStage = 1;
    return {
      action: 'inject-context',
      message: `[LOOP] ${state.totalLoopCount}x "${state.lastToolName}". Investigate before retry.`,
    };
  }

  state.escalationStage = 0;
  return { action: 'pass' };
}

/**
 * Reset loop state — called when PSM activates to break the loop.
 * Resets ALL counters and tracking fields so the agent can resume
 * using tools with a clean slate after PSM framework injection.
 */
export function resetLoopState(state: LoopState): void {
  state.totalLoopCount = 0;
  state.escalationStage = 0;
  state.sameToolCount = 0;
  state.sameResultCount = 0;
  state.noProgressCount = 0;
  state.lastToolName = null;
  state.lastResultHash = null;
  state.lastPatterns.clear();
}
