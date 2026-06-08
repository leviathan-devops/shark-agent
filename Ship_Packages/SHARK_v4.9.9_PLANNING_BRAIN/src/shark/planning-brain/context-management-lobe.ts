/**
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

const IMPLEMENT_TOOLS = new Set(['write', 'edit', 'write_file', 'patch', 'create', 'mkdir']);
const TEST_TOOLS = new Set(['shark-test-runner', 'shark-spawn-container', 'shark-run-trident']);
const EXPLORE_TOOLS = new Set(['read', 'grep', 'glob', 'find']);

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

  /**
   * Update context docs based on tool call and result.
   * ONLY updates docs when their specific trigger fires.
   * Does NOT update all 9 on every tool call.
   */
  updateRelevantDocs(toolName: string, args: unknown, output: unknown, gate: string): void {
    const taskId = `tool-${Date.now().toString(36)}`;

    if (toolName === 'todowrite') {
      const todos = (args as any)?.todos || [];
      if (Array.isArray(todos)) {
        for (const todo of todos) {
          if (todo?.content && todo?.status) {
            updateBuildStateOnTaskComplete(todo.content, todo.status, todo.content);
            updateTaskQueue(todo.content, todo.content,
              todo.status === 'completed' ? 'COMPLETE' :
              todo.status === 'in_progress' ? 'PENDING' : 'COMPLETE',
              todo.content);
          }
        }
      }
    }

    if (toolName === 'shark-test-runner' || toolName === 'shark-spawn-container') {
      const passed = (output as any)?.overallPassed === true;
      updateEvidenceState(0, `${toolName} at ${gate}: ${passed ? 'PASS' : 'FAIL'}`,
        passed ? 'verified' : 'failed');
    }

    if (toolName === 'write' || toolName === 'edit') {
      const filePath = (args as any)?.filePath || (args as any)?.path || '';
      if (filePath) {
        updateBuildStateOnTaskComplete(`Wrote ${filePath}`, 'in_progress', `Writing ${filePath}`);
        updateTaskQueue(`Writing ${filePath}`, `Write: ${filePath}`, 'PENDING', `Writing ${filePath}`);
      }
    }

    if (toolName === 'shark-run-trident') {
      const findings = (output as any)?.findings;
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
      const taskLines = taskQueue.split('\n').filter(l =>
        l.includes('**Current Focus:**') || l.includes('[x]') || l.includes('[ ]'));
      const currentTask = taskLines.length > 0 ? taskLines[taskLines.length - 1] : 'No active task';

      const thoughtStream = fs.readFileSync(this.thoughtStreamPath, 'utf-8');
      const toolEntries = thoughtStream.split('\n').filter(l => l.includes('tool='));
      const lastTools = toolEntries.slice(-5).map(l => {
        const m = l.match(/tool=(\w+)/);
        return m ? m[1] : 'unknown';
      });

      const hasImplement = lastTools.some(t => IMPLEMENT_TOOLS.has(t));
      const hasTest = lastTools.some(t => TEST_TOOLS.has(t));
      const hasExploreOnly = lastTools.every(t => EXPLORE_TOOLS.has(t));

      const pendingTasks = taskLines.filter(l => l.includes('[ ]'));
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
        return `[CTX] Container: steps 6-12 TUI protocol. Start with --entrypoint "" + baseline binary. Verify config grep model. TUI via tmux docker exec -it.`;
      case 'shark-test-runner':
        return `[CTX] Evidence: machine-generated with pass/fail per test, verifiable timestamps, raw tool output. No node -e JSON gen.`;
      case 'todowrite':
        return `[CTX] todowrite: task-specific entries. Each maps to a subtask. status=in_progress on start, status=completed on finish.`;
      case 'shark-gate': {
        const action = (args as any)?.action || '';
        if (action === 'advance') return `[CTX] Gate advance: verify matrix must be behavioral-pass for delivery.`;
        return null;
      }
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
