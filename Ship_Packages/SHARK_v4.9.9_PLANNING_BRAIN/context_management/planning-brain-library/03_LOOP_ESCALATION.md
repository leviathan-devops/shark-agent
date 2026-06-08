# 03: Loop Escalation & PSM Activation — Build Spec

## Overview

This lobe coordinates the escalation ladder. When the agent gets stuck in a loop (calling the same tool with the same result, or producing no filesystem change), the planning brain escalates through three stages before activating the Frontal Lobe (PSM):

1. **Loops 1-2**: Context Management injects precision context bullet (soft reminder)
2. **Loops 3-4**: Common Sense fires evaluateBeforeExecution (stronger signal — questions the agent's approach)
3. **Loop 5+**: Frontal Lobe (PSM) ACTIVATED — tool.execute.before BLOCKS the 5th attempt

The purpose is to give the agent MULTIPLE chances to self-correct before forcing PSM. Most loops resolve at stage 1 or 2 with just a context injection.

## Three types of loops detected:

| Loop Type | Detection | Counts As |
|-----------|-----------|-----------|
| **Same tool** | Same toolName called consecutively with no intervening write/edit | +1 loop |
| **Same result** | Tool produces same output/error message as previous call | +1 loop |
| **No progress** | N tool calls without any filesystem change (write/edit/mkdir) | +1 loop |

## File: `src/shark/planning-brain/loop-detector.ts`

```typescript
// src/shark/planning-brain/loop-detector.ts
// Token budget: ~150 lines, ~3500 tokens

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface LoopState {
  lastToolName: string | null;
  lastResultHash: string | null;     // hash of last output
  sameToolCount: number;
  sameResultCount: number;
  noProgressCount: number;           // tool calls since last filesystem change
  totalLoopCount: number;
  escalationStage: 0 | 1 | 2 | 3;   // 0=none, 1=context, 2=common-sense, 3=psm
  lastFileSystemChange: number;      // timestamp
}

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

/**
 * Detect if current tool call is part of a loop.
 * 
 * DETECTION (no regex on agent text):
 * 1. Same tool name as last call → increment sameToolCount
 * 2. Same output hash as last call → increment sameResultCount  
 * 3. Tool is not a write/edit/file-create → increment noProgressCount
 * 
 * A "loop" is any of the above exceeding threshold.
 */
export function detectLoop(
  state: LoopState,
  toolName: string,
  args: unknown,
  output: unknown
): { isLoop: boolean; type: 'same-tool' | 'same-result' | 'no-progress' | null } {
  
  // Reset counters if this is a different tool
  if (state.lastToolName && toolName !== state.lastToolName) {
    state.sameToolCount = 0;
  }
  
  // Check for same tool
  if (state.lastToolName === toolName) {
    state.sameToolCount++;
  } else {
    state.sameToolCount = 0;
  }
  
  // Check for same result (hash output)
  const outputStr = JSON.stringify(output || '');
  const resultHash = simpleHash(outputStr);
  if (state.lastResultHash === resultHash && state.lastToolName === toolName) {
    state.sameResultCount++;
  } else {
    state.sameResultCount = 0;
  }
  
  // Check for progress (filesystem change)
  const writeTools = new Set(['write', 'edit', 'write_file', 'patch', 'mkdir', 'delete_file']);
  if (writeTools.has(toolName)) {
    state.noProgressCount = 0;
    state.lastFileSystemChange = Date.now();
  } else {
    state.noProgressCount++;
  }
  
  // Update state
  state.lastToolName = toolName;
  state.lastResultHash = resultHash;
  
  // Determine if this is a loop
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

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}
```

## Escalation Logic (in planning-brain index.ts)

```typescript
// Escalation logic — called from tool.execute.before via planning brain

export function getEscalationAction(
  state: LoopState,
  loopType: string | null
): { action: 'pass' | 'inject-context' | 'inject-common-sense' | 'block-psm'; message?: string } {
  
  // Reset totalLoopCount if agent made progress (filesystem change)
  if (state.noProgressCount === 0 && state.totalLoopCount > 0) {
    state.totalLoopCount = Math.max(0, state.totalLoopCount - 1); // Decay
  }
  
  const count = state.totalLoopCount;
  
  if (count >= 5) {
    state.escalationStage = 3;
    return {
      action: 'block-psm',
      message: `[LOOP DETECTED] ${count} consecutive loop iterations detected. Problem Solving Mode activated. Tool call blocked until PSM produces a new execution plan.`,
    };
  }
  
  if (count >= 3) {
    state.escalationStage = 2;
    return {
      action: 'inject-common-sense',
      message: `[COMMON SENSE] ${count} loop iterations detected. Tool: ${state.lastToolName}. Same result: ${state.sameResultCount > 1}. No filesystem change: ${state.noProgressCount} calls. Current trajectory appears unproductive. Consider changing approach.`,
    };
  }
  
  if (count >= 1) {
    state.escalationStage = 1;
    return {
      action: 'inject-context',
      message: `[CTX] Loop detected: calling ${state.lastToolName} repeatedly. Verify this is the correct approach for the current task.`,
    };
  }
  
  state.escalationStage = 0;
  return { action: 'pass' };
}
```

## Loop State Decay Rules

The loop counter must decay over time to prevent "stuck permanently" syndrome:
- Every filesystem write/edit tool call: decrement totalLoopCount by 1 (min 0)
- Every 20 tool calls without a loop: decrement by 1
- Session compaction: preserve loop state (it's part of the planning brain state)

## What the Engineering Agent MUST Do

1. Create `src/shark/planning-brain/loop-detector.ts` with all code above
2. Wire the escalation logic into `src/shark/planning-brain/index.ts`
3. The PSM activation BLOCK must be a real `throw new Error(...)` that stops tool execution — not a system message
4. Loop detection must use tool names + output hashing, NOT regex on agent chat text
5. Ensure loop state decays properly (not permanent, not easily reset by doing one benign action)

## PSM Activation Flow

When `getEscalationAction` returns `block-psm`, the following happens:

1. **`tool.execute.before`** throws a `StructuredBlockError` with:
   - `level: 'BLOCK'`
   - `lobe: 'frontal'`
   - `message: '[LOOP DETECTED] X consecutive loop iterations. Problem Solving Mode activated. Tool call blocked until PSM produces a new execution plan.'`
2. **The tool call is CANCELLED** — the error propagates up, the tool never executes.
3. **The agent receives the error** and MUST run PSM (Trident Problem Solving Mode) before continuing.
4. **PSM runs its 6-layer pipeline**: Assumption → Action → Observation → Gap Analysis → Meta-Reflection → Verification.
5. **If PSM completes successfully**, the agent produces a new plan. The loop count is reset to 0.
6. **If PSM fails or agent tries to skip it**, the NEXT tool call also gets blocked with the same error.

This is non-negotiable. The agent cannot "just continue" after a PSM activation. It must think before acting.

## PSM Integration Points

The Frontal Lobe (PSM) already exists as Trident's Problem Solving Mode. The planning brain integrates with it via:

1. **Before PSM — Common Sense injection**: When loop count reaches 3-4, inject a common sense bullet that describes the loop in behavioral terms (not accusations). Example:
   ```
   [COMMON SENSE] You've called "shark-hive-context" 4 times with no filesystem change.
   The task queue says "implement feature X". Last 5 tools contained no write/edit.
   Consider whether you have enough context to start implementing.
   ```
   This gives the agent a chance to self-correct WITHOUT needing PSM.

2. **PSM Entry Condition**: Loop count ≥ 5, OR loop count ≥ 3 with no filesystem change for 15+ tools.

3. **PSM Exit Condition**: PSM pipeline completes AND produces a new plan file at `.shark/psm-plan.json`.

4. **PSM Failure Handling**: If PSM was activated but the plan file doesn't exist after 3 tool calls, re-block with:
   ```
   [PSM] Previous activation did not produce a plan. Run PSM properly.
   ```

## Common Sense Injection Format (Loops 3-4)

Format must be under 60 tokens, factual (not accusatory), and include actionable context:

```
[LOOP] {count} iterations. Tool: {tool}. No FS change: {n}. Task: {task from queue}. {context}
```

Valid examples:
```
[LOOP] 3 iterations. Tool: shark-hive-context. No FS change: 8 calls. Task: implement parser. Context: parser.ts not found — may need create, not explore.
```
(~25 tokens)

Invalid examples:
```
[LOOP] You seem to be stuck in a loop. You've been calling the same tool over and over and you haven't made any progress on the actual task. This is not productive behavior. Please consider changing your approach.
```
(~40 words, ~55 tokens — too vague, no actionable context)

## Implementation: Loop Detector State Machine

```
State Machine States:
  IDLE — No loop detected. lastToolName = null. totalLoopCount = 0.
  
  OBSERVING — Same tool called twice. Incrementing counters. 
    Transition to WARNING if sameToolCount >= 2 or noProgressCount >= 5.
  
  WARNING — Loop suspected. totalLoopCount 1-2.
    Context management injects reminder. No block.
    Transition to ESCALATION if sameToolCount >= 3 or totalLoopCount >= 3.
  
  ESCALATION — Loop confirmed. totalLoopCount 3-4.
    Common Sense injects behavioral warning. No block.
    Transition to PSM_BLOCK if totalLoopCount >= 5.
  
  PSM_BLOCK — Hard block. Tool execution cancelled.
    Transition back to IDLE when PSM produces plan file.
```

State transitions are deterministic — no model inference needed.

## Anti-Patterns

- **Reset on any action**: Agent does one write, loop counter resets to 0, then immediately loops again. FIX: Decay by 1, don't reset to 0.
- **Ignore no-progress loops**: Agent calls read/grep 50 times, never writes. FIX: noProgressCount tracks non-write tools; after 10, flags as loop.
- **PSM never activates**: threshold set too high (e.g., 20 loops). FIX: Threshold is 5. If the agent is actually productive, totalLoopCount decays.
- **PSM activates but agent ignores it**: Agent receives the block error and immediately tries a different tool instead of running PSM. FIX: The PSM block error message tells the agent exactly what to do (run PSM). If agent doesn't comply, next tool call is also blocked.
- **Loop count grows unbounded**: Agent loops 50 times, totalLoopCount = 50. Even after PSM completes, the count stays high. FIX: PSM completion resets to 0. Normal decay: -1 per write, -1 per 20 tools.
