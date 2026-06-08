/**
 * System Transform Hook — T1 warhead injection via identity synthesis pipeline
 *
 * v4.9.9: T2->T1->T0 identity pipeline + planning brain integration.
 * Instead of injecting 8-50KB of raw identity text on every transform,
 * injects T1 precision warheads (~1.8KB total) synthesized from T2.
 *
 * Architecture:
 *   T2 (identity files ~50KB) -> synthesizeT1Injectables() -> T1 (6 warheads ~1.8KB)
 *   T1 injected on EVERY transform (no guards).
 *   Recovery warhead only injected if recently compacted.
 *   Full T2 sections available on-demand via loadT2Section().
 *
 * Keeps existing: enforcement context, delivery gate warnings, build context.
 * Removed: formatSharkIdentityHeader() (raw T2 artifact ~2KB).
 * Removed: getSharkIdentityPrompt() (raw T2 dump ~8-50KB).
 * Removed: SHARK_PLUGIN_IDENTITY import (unused in this file).
 */
import type { Hooks } from '@opencode-ai/plugin';
import { GateManager } from '../../shared/gates.js';
import { isSharkAgent } from '../../shared/agent-identity.js';
import { getCurrentAgent } from './agent-state.js';
import { logInfo } from '../../shared/shark-logger.js';
import { getT1Injectables, hasRecoveryCheckpoint } from '../../shared/identity-synthesizer.js';
import { getPlanningBrain } from '../../shark/planning-brain/index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const CONTAINER_TEST_RESULT_FILE = 'ContainerTestResult.json';

export function resetSystemTransformState(): void {
  // No mutable state — T1 warheads injected on every transform.
  // Cache is managed by identity-synthesizer module.
}

export function createSystemTransformHook(
  gateManager: GateManager,
  _peerDispatch?: unknown
): Hooks['experimental.chat.system.transform'] {
  return async (
    input: { sessionID?: string; model: unknown },
    output: { system: string[] },
    ctx?: { agentName?: string }
  ) => {
    // Read agent from session state (set by chat.message hook) OR from input
    const sessionAgent = getCurrentAgent(input.sessionID);
    const agent = sessionAgent || (ctx?.agentName || (input as any)?.agentName || (input as any)?.agent || '').split('-')[0] || '';
    const isThisSharkAgent = isSharkAgent(agent);

    if (!isThisSharkAgent) {
      return;
    }

    logInfo('experimental.chat.system.transform: agent=' + agent + ', injecting T1 warheads');

    const state = gateManager.getState();
    const systemOutput = output as { system?: string[] };
    if (!Array.isArray(systemOutput.system)) {
      systemOutput.system = [];
    }

    // ═══════════════════════════════════════════════
    // T1 WARHEAD INJECTION — precision identity synthesis
    // Total: ~1.8KB across all 6 warheads
    // Order (highest to lowest priority):
    //   1. enforcementContext (situational — gate/iteration)
    //   2. buildContext (situational — from file)
    //   3. RuntimeGradeEngineerWarhead (PERMANENT — highest behavioral mandate)
    //   4. identityWarhead (PERMANENT — agent identity)
    //   5. enforcementWarhead (PERMANENT — active rules)
    //   6. gateWarhead (PERMANENT — gate chain)
    //   7. focusWarhead (DYNAMIC — active task)
    //   8. recoveryWarhead (DYNAMIC — only if compacted)
    //   9. deliveryWarning (only if at DELIVERY gate)
    // ═══════════════════════════════════════════════
    const t1 = getT1Injectables();

    // Build the output array in CORRECT priority order (index 0 = highest priority)
    const warheads: string[] = [];

    // 1. RUNTIME GRADE SOFTWARE ENGINEER WARHEAD — highest permanent priority
    //    Injected BEFORE identity so the workflow shapes ALL behavior.
    //    The model reads "WHAT IS THE MANDATORY PROCEDURE" before "who am I"
    if (t1.RuntimeGradeEngineerWarhead) {
      warheads.push(t1.RuntimeGradeEngineerWarhead);
    }

    // 2. IDENTITY WARHEAD — establishes agent identity (~200B)
    warheads.push(t1.identityWarhead);

    // 3. ENFORCEMENT WARHEAD — active enforcement rules (~200B)
    warheads.push(t1.enforcementWarhead);

    // 4. GATE WARHEAD — current gate and chain (~200B)
    warheads.push(t1.gateWarhead);

    // 5. FOCUS WARHEAD — active task context (~500B, dynamic)
    warheads.push(t1.focusWarhead);

    // 6. RECOVERY WARHEAD — only injected if recently compacted (~200B)
    if (hasRecoveryCheckpoint()) {
      warheads.push(t1.recoveryWarhead);
    }

    // ═══════════════════════════════════════════════
    // BUILD CONTEXT — external file, injected on every transform
    // ═══════════════════════════════════════════════
    const buildContext = loadBuildContext();

    // ═══════════════════════════════════════════════
    // GATE ENFORCEMENT CONTEXT — current gate/iteration, highest situational priority
    // ═══════════════════════════════════════════════
    const enforcementContext = [
      'GATE ENFORCEMENT:',
      'Current Gate: ' + ((state.currentGate as string)?.toUpperCase() || 'PLAN'),
      'Iteration: ' + (state.currentIteration || 'V1.0'),
      'Chain: PLAN -> BUILD -> VERIFY -> TEST -> AUDIT -> DELIVERY',
      'Evidence required at each gate before advancement.',
    ].join('\n');

    // Build final array: enforcementContext + buildContext + warheads
    const finalOutput: string[] = [];
    finalOutput.push(enforcementContext);
    if (buildContext) {
      finalOutput.push(buildContext);
    }
    for (const w of warheads) {
      finalOutput.push(w);
    }

    // ═══════════════════════════════════════════════
    // DELIVERY GATE: Container tests mandatory
    // ═══════════════════════════════════════════════
    if (state.currentGate === 'delivery') {
      const testEvidencePath = path.join(process.cwd(), '.shark', 'evidence', 'delivery', CONTAINER_TEST_RESULT_FILE);
      let testStatus = 'NOT_RUN';
      let testPassed = false;

      if (fs.existsSync(testEvidencePath)) {
        try {
          const testResult = JSON.parse(fs.readFileSync(testEvidencePath, 'utf-8'));
          testStatus = testResult.overallPassed ? 'PASSED' : 'FAILED';
          testPassed = testResult.overallPassed;
        } catch {
          testStatus = 'ERROR_READING';
        }
      }

      const deliveryWarning = [
        'Delivery Gate Status: ' + testStatus,
        'Run shark-test-runner action=run before delivery (90%+ required).',
      ].join('\n');

      finalOutput.push(deliveryWarning);

      if (!testPassed && testStatus !== 'NOT_RUN') {
        finalOutput.push('Tests FAILED. Fix before delivery.');
      } else if (testStatus === 'NOT_RUN') {
        finalOutput.push('No container test evidence. Run: shark-test-runner action=run');
      }
    }

    // ═══════════════════════════════════════════════
    // PLANNING BRAIN INJECTIONS — verification matrix status + bible flag
    // ═══════════════════════════════════════════════
    try {
      const planningBrain = getPlanningBrain();
      if (planningBrain && planningBrain.enabled) {
        // Mark bible as injected (Gap 3 fix — uses flag, not file timestamps)
        planningBrain.markBibleInjected();

        // Inject verification matrix status for untested requirements
        const injections = planningBrain.getSystemInjections();
        for (const inj of injections) {
          finalOutput.push(inj);
        }
      }
    } catch {
      // Non-fatal — planning brain errors don't break system transform
    }

    // Assign the correctly-ordered array to system output
    systemOutput.system.length = 0;
    for (const item of finalOutput) {
      systemOutput.system.push(item);
    }
  };
}

function loadBuildContext(): string | null {
  try {
    const primaryPath = path.join(process.cwd(), '.shark', 'auto-inject', 'BUILD_CONTEXT.md');
    if (fs.existsSync(primaryPath)) {
      return fs.readFileSync(primaryPath, 'utf-8');
    }
    const legacyPath = path.join(process.cwd(), '.shark', 'build-context.md');
    if (fs.existsSync(legacyPath)) {
      return fs.readFileSync(legacyPath, 'utf-8');
    }
  } catch {
    // Silent fail
  }
  return null;
}
