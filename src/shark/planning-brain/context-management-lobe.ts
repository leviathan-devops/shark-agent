/**
 * @deprecated Replaced by CME TrajectoryEngine + FileContextMemory.
 * Context Management Lobe — Context Integration + Drift Detection + Warm Context
 * 
 * The "subconscious" of the planning brain. Always running, always updating
 * 9 context docs WHEN RELEVANT (not on every tool call). Detects drift by
 * comparing tool trajectory against task queue. Injects precision context
 * bullets at the right moment.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  updateBuildStateOnTaskComplete, updateTaskQueue, updateDecisionChain,
  updateDebugLog, updateChangelog, updateEvidenceState,
} from '../../shared/context-manager.js';
import { isRecord, safeGetString, safeGetBoolean, safeGetArray, safeGetRecord } from '../../shared/type-guards.js';
import type { VerbFrameLexicon } from '../karpathy/verb-frame-lexicon.js';

const IMPLEMENT_TOOLS = new Set(['write', 'edit', 'write_file', 'patch', 'create', 'mkdir']);
const TEST_TOOLS = new Set(['shark-test-runner', 'shark-spawn-container', 'shark-run-trident']);
const EXPLORE_TOOLS = new Set(['read', 'grep', 'glob', 'find']);

const CRITICAL_CONTEXT_DOCS = [
  'TASK_QUEUE.md', 'DECISION_CHAIN.md', 'BUILD_STATE.md', 'SPEC.md',
];

export class ContextManagementLobe {
  private contextDir: string;
  private taskQueuePath: string;
  private thoughtStreamPath: string;
  private sessionStartTime: number;

  constructor(basePath: string, contextDir: string) {
    this.contextDir = contextDir;
    this.taskQueuePath = path.join(contextDir, 'TASK_QUEUE.md');
    this.thoughtStreamPath = path.join(contextDir, 'THOUGHT_STREAM.md');
    this.sessionStartTime = Date.now();
  }

  getContextDir(): string {
    return this.contextDir;
  }

  hasReadContextDocs(readHistory: Map<string, number>): boolean {
    for (const doc of CRITICAL_CONTEXT_DOCS) {
      if (readHistory.has(path.join(this.contextDir, doc))) return true;
    }
    return false;
  }

  getLatestContextRead(readHistory: Map<string, number>): number {
    let latest = 0;
    for (const doc of CRITICAL_CONTEXT_DOCS) {
      const ts = readHistory.get(path.join(this.contextDir, doc)) || 0;
      if (ts > latest) latest = ts;
    }
    return latest;
  }

  getRequiredReads(filePath: string, lexicon: VerbFrameLexicon): string[] {
    return CRITICAL_CONTEXT_DOCS.map((d: string) => path.join(this.contextDir, d));
  }

  /**
   * Update context docs based on tool call and result.
   * ONLY updates docs when their specific trigger fires.
   * Does NOT update all 9 on every tool call.
   */
  updateRelevantDocs(toolName: string, args: unknown, output: unknown, gate: string): void {
    // NOTE: This function updates context docs based on tool results but does NOT
    // advance the state machine (gate transitions). State machine advancement is
    // centralized at the hook level in tool-after-handler.ts (step 14: auto-advance
    // gate), which calls into the planning brain's onAfterExecution() which in turn
    // calls this function. Keeping advancement in the hook prevents duplicate
    // transitions and ensures gate criteria are verified before any advance.
    const taskId = `tool-${Date.now().toString(36)}`;

    if (toolName === 'todowrite') {
      const todos = isRecord(args) ? safeGetArray(args, 'todos') : [];
      if (Array.isArray(todos)) {
        for (const todo of todos as Record<string, unknown>[]) {
          if (todo?.content && todo?.status) {
            updateBuildStateOnTaskComplete(String(todo.content), String(todo.status), String(todo.content));
            updateTaskQueue(String(todo.content), String(todo.content),
              todo.status === 'completed' ? 'COMPLETE' :
              todo.status === 'in_progress' ? 'PENDING' : 'COMPLETE',
              String(todo.content));
          }
        }
      }
    }

    if (toolName === 'shark-test-runner' || toolName === 'shark-spawn-container') {
      const passed = isRecord(output) ? safeGetBoolean(output, 'overallPassed') : false;
      updateEvidenceState(0, `${toolName} at ${gate}: ${passed ? 'PASS' : 'FAIL'}`,
        passed ? 'verified' : 'failed');
    }

    if (toolName === 'shark-run-trident') {
      const findings = isRecord(output) ? safeGetRecord(output, 'findings') : {};
      if (findings) {
        updateChangelog(`Trident audit at ${gate}`,
          [{ issue: taskId, file: '-', change: `${findings.critical} critical, ${findings.high} high` }],
          `Audit: ${findings.critical} critical, ${findings.high} high`);
      }
    }

    const outputStr = JSON.stringify(output || {});
    if (outputStr.includes('BLOCKED')) {
      updateDebugLog('enforcement-block', `Tool:${toolName} at ${gate} blocked`,
        'Enforcement action', 'Review logs', 'Block recorded');
      updateDecisionChain(`Enforcement at ${gate}`, `Tool ${toolName} blocked`, `Gate:${gate}`);
    }
  }

  /**
   * Structural drift detection — compares tool trajectory against task queue.
   * Uses tool-name sets (IMPLEMENT_TOOLS, TEST_TOOLS, EXPLORE_TOOLS) not string.includes.
   */
  detectDrift(): { detected: boolean; expected: string; actual: string; context: string; severity: 'info' | 'warn' | 'drift' } | null {
    try {
      const taskQueue = fs.readFileSync(this.taskQueuePath, 'utf-8');
      const taskLines = taskQueue.split('\n').filter((l: string) =>
        l.includes('**Current Focus:**') || l.includes('[x]') || l.includes('[ ]'));
      const currentTask = taskLines.length > 0 ? taskLines[taskLines.length - 1] : 'No active task';

      const thoughtStream = fs.readFileSync(this.thoughtStreamPath, 'utf-8');
      const toolEntries = thoughtStream.split('\n').filter((l: string) => l.includes('tool='));
      const lastTools = toolEntries.slice(-5).map((l: string) => {
        const m = l.match(/tool=(\w+)/);
        return m ? m[1] : 'unknown';
      });

      const hasImplement = lastTools.some((t: string) => IMPLEMENT_TOOLS.has(t));
      const hasTest = lastTools.some((t: string) => TEST_TOOLS.has(t));
      const hasExploreOnly = lastTools.every((t: string) => EXPLORE_TOOLS.has(t));

      const pendingTasks = taskLines.filter((l: string) => l.includes('[ ]'));
      let drift = false;
      let context = '';

      if (pendingTasks.length > 0 && !hasImplement && hasExploreOnly) {
        drift = true;
        context = `Pending tasks exist but last 5 tools (${lastTools.join(', ')}) contain only explore tools. Implementation needs write/edit.`;
      }
      if (pendingTasks.length > 0 && !hasTest && hasExploreOnly) {
        drift = true;
        context = `No test tools in last 5 calls (${lastTools.join(', ')}). Testing needs shark-test-runner.`;
      }

      if (drift) {
        return { detected: true, expected: `Task: ${currentTask}`, actual: `Last tools: ${lastTools.join(', ')}`, context, severity: 'warn' };
      }
      return { detected: false, expected: currentTask, actual: lastTools.join(', '), context: '', severity: 'info' };
    } catch (err) {
      console.error(`[ContextMgmt] detectDrift error: ${err}`);
      return null;
    }
  }

  /**
   * Precision context bullets based on detected tool triggers.
   * Each bullet under 50 tokens. NEVER full bible or full spec.
   */
  injectWarmContext(toolName: string, args: unknown): string | null {
    switch (toolName) {
      case 'shark-spawn-container':
        return '[CONTEXT] Container TUI: steps 6-12 protocol. --entrypoint "" + binary. Verify config.';
      case 'shark-test-runner':
        return '[CONTEXT] Evidence: pass/fail per test, raw output. No node -e JSON.';
      case 'todowrite':
        return '[CONTEXT] todowrite: task entries. in_progress=start, completed=finish.';
      case 'shark-gate': {
        const action = isRecord(args) ? safeGetString(args, 'action') : '';
        if (action === 'advance') return `[CONTEXT] Gate advance: verify matrix must be behavioral-pass for delivery.`;
        return null;
      }
      case 'write':
      case 'edit':
      case 'write_file':
      case 'create':
        return `[CONTEXT] Context docs at ${this.contextDir}/TASK_QUEUE.md. Read before write.`;
      default:
        return null;
    }
  }

  saveState(): { sessionStartTime: number; contextDir: string } {
    return { sessionStartTime: this.sessionStartTime, contextDir: this.contextDir };
  }

  restoreState(state: { sessionStartTime: number; contextDir: string }): void {
    this.sessionStartTime = state.sessionStartTime;
    this.contextDir = state.contextDir;
  }

  processMessageStream(_messages: unknown[]): string[] {
    // Placeholder — future implementation will extract tool call info from message metadata
    return [];
  }
}
