# 02: Context Management Lobe — Build Spec

## Overview

The Context Management Lobe is the "subconscious" of the planning brain. It runs silently on every message transformation, tool execution, and gate transition. Its job is to:

1. **Auto-update the 9 context docs WHEN RELEVANT** — building on the existing mechanical architecture in hooks/index.ts (which already updates THOUGHT_STREAM, COMPACTION_SURVIVAL, POST-COMPACTION_PROMPT on every tool call). This lobe adds the REMAINING 6 docs but ONLY when their specific trigger fires.
2. **Detect drift** by comparing tool call trajectory (from THOUGHT_STREAM.md) against expected task (from TASK_QUEUE.md), including RELEVANT CONTEXT — not just a data stream of tool names.
3. **Inject precision context bullets** when it detects the agent is operating without the relevant context loaded.

## File: `src/shark/planning-brain/context-management-lobe.ts`

### Section A: Context Doc Update Triggers (lines 1-120)

The lobe does NOT update all 9 docs on every tool call. It updates docs ONLY when their specific trigger fires:

```typescript
// src/shark/planning-brain/context-management-lobe.ts
// Token budget: ~350 lines, ~8000 tokens

import { updateBuildStateOnTaskComplete, updateTaskQueue, updateDecisionChain,
         updateDebugLog, updateChangelog, updateEvidenceState } from '../../shared/context-manager.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

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
   * Called from tool.execute.after via planning brain index.
   * Only updates docs when their specific trigger fires.
   * 
   * Trigger map:
   *   todowrite → BUILD_STATE.md, TASK_QUEUE.md
   *   shark-test-runner → EVIDENCE_STATE.md
   *   gate transition (detected from output) → COMPACTION_SURVIVAL.md, POST-COMPACTION_PROMPT.md
   *   enforcement block (detected from output) → DEBUG_LOG.md, DECISION_CHAIN.md
   *   milestone/breakthrough (detected from output) → CHANGELOG.md, SoC_PRESERVATION.md
   */
  updateRelevantDocs(toolName: string, args: unknown, output: unknown, gate: string): void {
    const taskId = `tool-${Date.now().toString(36)}`;
    
    // Trigger: todowrite tool → BUILD_STATE.md + TASK_QUEUE.md
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

    // Trigger: test-runner tool → EVIDENCE_STATE.md
    if (toolName === 'shark-test-runner' || toolName === 'shark-spawn-container') {
      const passed = (output as any)?.output?.overallPassed === true;
      updateEvidenceState(0, `${toolName} at ${gate} gate: ${passed ? 'PASS' : 'FAIL'}`, 
        passed ? 'verified' : 'failed');
    }

    // Trigger: trident code review → CHANGELOG.md
    if (toolName === 'shark-run-trident') {
      const findings = (output as any)?.output?.findings;
      if (findings) {
        const critical = findings.critical || 0;
        const high = findings.high || 0;
        updateChangelog(`Trident audit at ${gate} gate`, 
          [{ issue: taskId, file: '-', change: `${critical} critical, ${high} high findings` }],
          `Audit completed with ${critical} critical, ${high} high`);
      }
    }

    // Trigger: enforcement block → DEBUG_LOG.md + DECISION_CHAIN.md
    // This is detected by the output containing enforcement metadata
    const outputStr = JSON.stringify(output || {});
    if (outputStr.includes('ENFORCEMENT') || outputStr.includes('BLOCKED')) {
      updateDebugLog('enforcement-block', 
        `Tool: ${toolName} at ${gate} gate triggered enforcement`,
        'Enforcement action taken', 
        'Review enforcement logs for details',
        'Enforcement block recorded');
      updateDecisionChain(`Enforcement at ${gate}`, 
        `Tool ${toolName} was blocked`, 
        `Gate: ${gate}`);
    }

    // Trigger: evidence collection → DECISION_CHAIN.md
    if (toolName === 'shark-evidence' || toolName === 'shark-gate') {
      updateDecisionChain(`Gate action at ${gate}`, 
        `Tool: ${toolName}`, 
        `Session gate: ${gate}`);
    }
  }
```

### Section B: Drift Detection (lines 121-250)

```typescript
  /**
   * Detect drift by comparing ACTUAL tool trajectory against EXPECTED task.
   * 
   * This does NOT regex on agent prose. It reads:
   *   1. TASK_QUEUE.md — first heading = what agent SAYS it's doing
   *   2. THOUGHT_STREAM.md — last 5 entries = what tools were ACTUALLY called
   *   3. File paths from write/edit tool args — what files were actually modified
   * 
   * Drift = when the tools called don't match what the task queue expects.
   * 
   * Example:
   *   TASK_QUEUE: "Implement feature X in src/feature.ts"
   *   ACTUAL: read, grep, ls (no write/edit touching src/feature.ts)
   *   DRIFT: "Expected: modifying src/feature.ts. Actual: exploring src/.
   *           Context: feature.ts doesn't exist yet — need to create it first."
   */
  detectDrift(): { detected: boolean; expected: string; actual: string; context: string; severity: 'info' | 'warn' | 'drift' } | null {
    try {
      // Read TASK_QUEUE.md to find current expected task
      const taskQueue = fs.readFileSync(this.taskQueuePath, 'utf-8');
      const taskLines = taskQueue.split('\n').filter(l => l.includes('**Current Focus:**') || l.includes('[x]') || l.includes('[ ]'));
      const currentTask = taskLines.length > 0 ? taskLines[taskLines.length - 1] : 'No active task';
      
      // Read THOUGHT_STREAM.md to find actual tool trajectory
      const thoughtStream = fs.readFileSync(this.thoughtStreamPath, 'utf-8');
      const toolEntries = thoughtStream.split('\n').filter(l => l.includes('tool='));
      const lastTools = toolEntries.slice(-5).map(l => {
        const match = l.match(/tool=(\w+)/);
        return match ? match[1] : 'unknown';
      });
      
      // Determine if there's a mismatch between expected task and actual tools
      // This uses STRUCTURAL PATTERN DETECTION, not string.includes on free text (Gap 4 fix):
      //
      // Define action verbs as tool-name sets instead of keyword-matching on task text:
      const IMPLEMENT_TOOLS = new Set(['write', 'edit', 'write_file', 'patch', 'create', 'mkdir']);
      const TEST_TOOLS = new Set(['shark-test-runner', 'shark-spawn-container', 'shark-run-trident']);
      const EXPLORE_TOOLS = new Set(['read', 'grep', 'glob', 'find', 'ls']);
      
      // Classify last 5 tools by category
      const hasImplement = lastTools.some(t => IMPLEMENT_TOOLS.has(t));
      const hasTest = lastTools.some(t => TEST_TOOLS.has(t));
      const hasExplore = lastTools.some(t => EXPLORE_TOOLS.has(t));
      
      // Detect drift using STRUCTURAL rules (not keyword matching on task text):
      //   1. If task queue shows pending/completed items that involve implementation,
      //      but last 5 tools contain no write/edit → drift
      //   2. If task queue shows testing-related items but no test tools → drift
      //   3. If all tools are explore tools with no implement/test within 10+ calls → drift
      
      // Read the full task queue structure (checkboxes)
      const pendingTasks = taskLines.filter(l => l.includes('[ ]'));
      const completedTasks = taskLines.filter(l => l.includes('[x]'));
      
      let drift = false;
      let context = '';
      
      if (pendingTasks.length > 0 && !hasImplement && hasExplore) {
        drift = true;
        context = `Pending implementation tasks exist but last 5 tools (${lastTools.join(', ')}) contain no write/edit calls. Only explore tools detected. Context: implementation requires write tools.`;
      }
      
      if (pendingTasks.length > 0 && !hasTest && hasExplore) {
        drift = true;
        context = `Pending tasks may require testing but no test tools detected in last 5 calls (${lastTools.join(', ')}). Context: testing requires shark-test-runner or spawn-container.`;
      }
      
      if (drift) {
        return {
          detected: true,
          expected: `Task: ${currentTask}`,
          actual: `Last tools: ${lastTools.join(', ')}`,
          context,
          severity: 'warn',
        };
      }
      
      return { detected: false, expected: currentTask, actual: lastTools.join(', '), context: '', severity: 'info' };
    } catch {
      return null;
    }
  }
```

### Section C: Warm Context Injection (lines 251-350)

```typescript
  /**
   * Inject precision context bullets based on detected tool triggers.
   * Called from tool.execute.before via planning brain index.
   * 
   * Each bullet is under 50 tokens. ONE bullet per trigger.
   * NEVER injects full bible or full spec — ONLY the 1-2 lines that matter RIGHT NOW.
   */
  injectWarmContext(toolName: string, args: unknown): string | null {
    switch (toolName) {
      case 'shark-spawn-container': {
        // Project name detected from args
        const projectName = (args as any)?.projectName || 'unknown';
        // Inject ONLY the container testing steps relevant to SPAWNING
        return `[CTX] Container spawn: ${projectName}. Steps 6-12 TUI protocol: start container with --entrypoint "" + baseline binary. Verify config grep '"model"'. TUI via tmux docker exec -it.`;
      }
      
      case 'shark-test-runner': {
        // Inject ONLY the evidence structure requirements
        return `[CTX] Evidence must be machine-generated. ContainerTestResult.json needs: pass/fail per test, verifiable timestamps (not hardcoded), raw tool output. No node -e JSON gen.`;
      }
      
      case 'todowrite': {
        // Inject ONLY the todo format requirements
        return `[CTX] todowrite: task-specific entries only. "working on task" is too vague. Each todo should map to a subtask. Update status=in_progress on start, status=completed on finish.`;
      }
      
      case 'shark-run-trident': {
        return `[CTX] Trident audit: findings are CRITICAL/HIGH/MED/LOW. Gate advancement requires 0 critical + 0 high. Focus on CRITICAL first.`;
      }
      
      case 'shark-gate': {
        const action = (args as any)?.action || '';
        if (action === 'advance') {
          return `[CTX] Gate advance: verification matrix must be checked. Delivery gate requires ALL behavioral requirements = behavioral-pass.`;
        }
        return null;
      }
      
      default:
        return null;
    }
  }
}
```

## Section D: Compaction State Save/Restore (lines 351-380)

```typescript
  /**
   * Save planning brain state to survive compaction.
   */
  saveState(): { sessionStartTime: number; contextDir: string } {
    return {
      sessionStartTime: this.sessionStartTime,
      contextDir: this.contextDir,
    };
  }

  restoreState(state: { sessionStartTime: number; contextDir: string }): void {
    this.sessionStartTime = state.sessionStartTime;
    this.contextDir = state.contextDir;
  }
}
```

## What the Engineering Agent MUST Do

1. Create `src/shark/planning-brain/context-management-lobe.ts` with ALL sections above
2. The `updateRelevantDocs` method must ONLY update docs when their specific trigger fires — do NOT add unconditional updates that hit all 9 on every tool call
3. The `detectDrift` method must read ACTUAL FILES (TASK_QUEUE.md, THOUGHT_STREAM.md), not agent chat history
4. The drift context must include RELEVANT CONTEXT — what the agent is missing, not just a tool name stream
5. Each warm context bullet must be under 50 tokens. Count them. If it's over, cut words.
6. Do NOT add any regex-based text analysis of agent chat messages in this file

## Verification Checklist

- [ ] `updateRelevantDocs` only fires on specific triggers, not every tool call
- [ ] `detectDrift` reads actual file contents, not agent prose
- [ ] Drift report includes context (what agent is missing), not just tool names
- [ ] Each warm context bullet is under 50 tokens
- [ ] No regex on agent chat output anywhere in this file
- [ ] State save/restore methods work for compaction survival
