/**
 * Loop Detector — Escalation ladder for the Planning Brain
 * 
 * Three loop types:
 *   same-tool: same toolName called consecutively
 *   same-result: tool produces same output hash
 *   no-progress: N tool calls without filesystem change
 * 
 * Escalation stages:
 *   1-2 loops: context injection (soft reminder)
 *   3-4 loops: common sense injection (stronger signal)
 *   5+ loops: PSM activation (hard block via StructuredBlockError)
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

  if (state.totalLoopCount >= 5) {
    state.escalationStage = 3;
    return {
      action: 'block-psm',
      message: `[PSM] ${state.totalLoopCount} loop iterations. PSM activated. Run PSM before continuing.`,
    };
  }
  if (state.totalLoopCount >= 3) {
    state.escalationStage = 2;
    return {
      action: 'inject-common-sense',
      message: `[LOOP] ${state.totalLoopCount} iters. Tool:${state.lastToolName}. No FS change:${state.noProgressCount}. Same result:${state.sameResultCount > 1}.`,
    };
  }
  if (state.totalLoopCount >= 1) {
    state.escalationStage = 1;
    return {
      action: 'inject-context',
      message: `[LOOP] ${state.totalLoopCount} iters. Tool:${state.lastToolName}. Verify this approach.`,
    };
  }

  state.escalationStage = 0;
  return { action: 'pass' };
}
