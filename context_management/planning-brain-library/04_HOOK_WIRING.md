# 04: Hook Wiring — Integration Build Spec

## Overview

The planning brain must be wired into FIVE hook points to achieve the same "inescapable" enforcement that identity has:

| Hook | Lobe | Purpose |
|------|------|---------|
| `tool.execute.before` | Common Sense + Frontal | Check action vs verification matrix; activate PSM on loop 5+ |
| `tool.execute.after` | Common Sense + Context | Measure outcome; update relevant docs; detect drift |
| `experimental.chat.messages.transform` | Context | Read message structure; detect drift |
| `experimental.chat.system.transform` | Both | Inject verification matrix status + warm context |
| `experimental.session.compacting` | Context | Save/restore planning brain state |

## CRITICAL SAFETY SWITCH

Before building any other code, implement the safety switch. This prevents a buggy planning brain from breaking the running agent on first load.

**Implementation:** The PlanningBrain class checks `process.env.SHARK_PLANNING_BRAIN` at initialization. If the env var is not `'enabled'`, ALL methods become no-ops. The agent functions exactly as before — no planning brain interference.

Only after the engineering agent builds the planning brain, container-tests it with the flag OFF, and verifies the existing agent still works, should the flag be flipped to `enabled`.

```typescript
// Safety switch check — place at TOP of every public method
if (process.env.SHARK_PLANNING_BRAIN !== 'enabled') {
  return null; // no-op: planning brain disabled
}
```

This also applies to hook wiring: each hook should check the flag before calling planning brain methods.

## File 1: `src/shark/planning-brain/index.ts`

```typescript
// src/shark/planning-brain/index.ts
// Token budget: ~250 lines, ~6000 tokens
// Orchestrates 3 lobes, wires into all 5 hook points
// CRITICAL: Safety switch via SHARK_PLANNING_BRAIN env var

import { CommonSenseLobe } from './common-sense-lobe.js';
import { ContextManagementLobe } from './context-management-lobe.js';
import { LoopDetector, LoopState, createLoopState, getEscalationAction } from './loop-detector.js';
import { VerificationMatrix, loadMatrix, saveMatrix, updateRequirementStatus } from '../../shared/verification-matrix.js';
import { StructuredBlockError } from '../enforcement-brain/index.js';

export interface PlanningBrainConfig {
  basePath: string;
  contextDir: string;
}

export class PlanningBrain {
  private commonSense: CommonSenseLobe;
  private contextMgmt: ContextManagementLobe;
  private loopState: LoopState;
  private matrix: VerificationMatrix;
  private config: PlanningBrainConfig;
  private enabled: boolean;
  private _bibleInjected: boolean = false;

  constructor(config: PlanningBrainConfig) {
    this.enabled = process.env.SHARK_PLANNING_BRAIN === 'enabled';
    if (!this.enabled) return; // Safety switch: no-op mode
    this.config = config;
    this.commonSense = new CommonSenseLobe(config.basePath, config.contextDir);
    this.contextMgmt = new ContextManagementLobe(config.basePath, config.contextDir);
    this.loopState = createLoopState();
    this.matrix = loadMatrix(config.basePath);
  }

  // Bible injection flag set by system-transform hook after auto-injecting bible content
  markBibleInjected(): void {
    if (!this.enabled) return;
    this._bibleInjected = true;
  }

  // ===== HOOK: tool.execute.before =====
  
  /**
   * Called from hooks/v4.1/index.ts tool.execute.before handler.
   * Returns precision bullet to inject, or null.
   * Throws StructuredBlockError if PSM activation required.
   */
  onBeforeExecution(toolName: string, args: unknown): { bullet: string | null } {
    if (!this.enabled) return { bullet: null }; // Safety switch: no-op
    
    // 1. Warm context injection (Context Management)
    const ctxBullet = this.contextMgmt.injectWarmContext(toolName, args);
    
    // 2. Loop detection
    const loopResult = this.loopState.detectLoop(toolName, args, {});
    const escalation = getEscalationAction(this.loopState, loopResult.type);
    
    // 3. PSM activation — hard block
    if (escalation.action === 'block-psm') {
      throw new StructuredBlockError({
        level: 'BLOCK',
        lobe: 'frontal',
        findingId: 'PSM-ACTIVATION',
        message: escalation.message || '[LOOP DETECTED] Problem Solving Mode activated.',
        correction: 'Run Trident PSM before continuing.',
      });
    }
    
    // 4. Common sense check — inject verification bullet
    const csBullet = this.commonSense.evaluateBeforeExecution(toolName, args, this.matrix);
    
    // Return the appropriate bullet (context, common sense, or escalation)
    const bullet = escalation.action === 'inject-context' ? escalation.message :
                   escalation.action === 'inject-common-sense' ? escalation.message :
                   ctxBullet || csBullet;
    
    return { bullet };
  }

  // ===== HOOK: tool.execute.after =====

  /**
   * Called from hooks/v4.1/index.ts tool.execute.after handler.
   * Updates context docs + verification matrix + detects drift.
   */
  onAfterExecution(toolName: string, args: unknown, output: unknown, gate: string): { driftWarning: string | null } {
    if (!this.enabled) return { driftWarning: null }; // Safety switch: no-op
    
    // 1. Update relevant context docs (Context Management)
    this.contextMgmt.updateRelevantDocs(toolName, args, output, gate);
    
    // 2. Update verification matrix (Common Sense)
    this.commonSense.evaluateAfterExecution(toolName, args, output, this.matrix);
    
    // 3. Drift detection (every 5 calls)
    if (this.loopState.totalLoopCount > 0 && this.loopState.totalLoopCount % 5 === 0) {
      const drift = this.contextMgmt.detectDrift();
      if (drift?.detected) {
        saveMatrix(this.config.basePath, this.matrix);
        return { driftWarning: `[DRIFT] ${drift.context}` };
      }
    }
    
    saveMatrix(this.config.basePath, this.matrix);
    return { driftWarning: null };
  }

  // ===== HOOK: experimental.chat.messages.transform =====

  /**
   * Called from hooks/v4.1/messages-transform-hook.ts.
   * Processes message stream for context awareness.
   */
  onMessageStream(messages: unknown[]): string[] {
    if (!this.enabled) return []; // Safety switch: no-op
    const bullets: string[] = [];
    const ctxBullets = this.contextMgmt.processMessageStream(messages);
    if (ctxBullets) bullets.push(...ctxBullets);
    return bullets;
  }

  // ===== HOOK: experimental.chat.system.transform =====

  /**
   * Returns system prompt injections for the current state.
   * Called from hooks/v4.1/system-transform-hook.ts.
   * Each injection is a precision bullet under 50 tokens.
   * Includes test instructions for untested requirements so the agent knows WHAT to do.
   */
  getSystemInjections(): string[] {
    if (!this.enabled) return []; // Safety switch: no-op
    const injections: string[] = [];
    
    // Verification matrix status with test instructions (Gap 5 fix)
    const untested = this.matrix.filter(r => r.status !== 'behavioral-pass');
    for (const req of untested) {
      // Include the behavioral test action so the agent knows what to do
      injections.push(`[VERIFY] ${req.id}:${req.status}. Test: ${req.behavioralTest.action}. Pass: ${req.behavioralTest.passCondition}.`);
    }
    
    // Loop status
    if (this.loopState.totalLoopCount >= 3) {
      injections.push(`[LOOP] ${this.loopState.totalLoopCount} iterations. Escalation: stage ${this.loopState.escalationStage}`);
    }
    
    // Keep total under 150 tokens
    return injections;
  }

  // ===== HOOK: experimental.session.compacting =====

  saveState(): Record<string, unknown> {
    return {
      loopState: this.loopState,
      matrix: this.matrix,
      contextState: this.contextMgmt.saveState(),
    };
  }

  restoreState(state: Record<string, unknown>): void {
    if (state.loopState) this.loopState = state.loopState as LoopState;
    if (state.matrix) this.matrix = state.matrix as VerificationMatrix;
    if (state.contextState) this.contextMgmt.restoreState(state.contextState as any);
  }

  getMatrix(): VerificationMatrix { return this.matrix; }
}

// Singleton accessor
let _instance: PlanningBrain | null = null;

export function createPlanningBrain(config: PlanningBrainConfig): PlanningBrain {
  _instance = new PlanningBrain(config);
  return _instance;
}

export function getPlanningBrain(): PlanningBrain {
  if (!_instance) throw new Error('PlanningBrain not initialized');
  return _instance;
}

export function resetPlanningBrain(): void {
  _instance = null;
}
```

## File 2: Hook Wiring in `src/hooks/v4.1/index.ts`

### Modify `tool.execute.before`:

```typescript
// After enforcement brain runs, before guardian hook:
const planningBrain = getPlanningBrain();
try {
  const result = planningBrain.onBeforeExecution(toolName, toolArgs);
  if (result.bullet) {
    output.system = output.system || [];
    output.system.push(result.bullet);
  }
} catch (err) {
  if (err instanceof StructuredBlockError) throw err;
  // Other errors: non-fatal, don't break tool execution
}
```

### Modify `tool.execute.after`:

```typescript
// After autonomous context updates, before summarizer:
try {
  const planningBrain = getPlanningBrain();
  const { driftWarning } = planningBrain.onAfterExecution(toolName, toolArgs, output, gateStr);
  if (driftWarning) {
    output.system = output.system || [];
    output.system.push(driftWarning);
  }
} catch {
  // Non-fatal
}
```

### Modify `experimental.chat.system.transform`:

After the existing T1 warhead injection, add:

```typescript
// Planning brain system injections (Common Sense + Context Management status)
try {
  const planningBrain = getPlanningBrain();
  const injections = planningBrain.getSystemInjections();
  for (const inj of injections) {
    systemOutput.system.push(inj);
  }
} catch {
  // Non-fatal
}
```

### Modify `experimental.session.compacting`:

```typescript
// Save/restore planning brain state
try {
  const state = planningBrain.saveState();
  // state is saved into the compaction snapshot
} catch { /* non-fatal */ }
```

## Instantiation in `src/index.ts`

```typescript
import { createPlanningBrain, PlanningBrain } from './shark/planning-brain/index.js';
import { getContextDir } from './shared/context-manager.js';

// After other initializations:
const planningBrain = createPlanningBrain({
  basePath: workspacePath,
  contextDir: getContextDir(),
});
```

## What the Engineering Agent MUST Do

1. Create `src/shark/planning-brain/index.ts` with the PlanningBrain class
2. The singleton pattern is REQUIRED — hooks are stateless and need a shared instance
3. Wire into ALL 5 hook points in `src/hooks/v4.1/index.ts`
4. Do NOT skip the drift detection — it's the primary mechanism for preventing the 14-pushback pattern
5. Do NOT wrap PSM activation in a try/catch — it must throw to block tool execution
6. Keep system injections under 150 tokens total (verify by counting)
