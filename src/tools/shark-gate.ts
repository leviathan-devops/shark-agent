/**
 * Shark Gate Tool
 * 
 * Manual gate evaluation and status check.
 */

import { tool } from '@opencode-ai/plugin';
import { z } from 'zod';
import type { Guardian } from '../shared/guardian.js';
import type { GateEngine, GateID } from '../gate-engine/gate-engine.js';
import { GateManager, GATE_ORDER } from '../shared/gates.js';
import { getMerkleChain } from '../evidence-engine/merkle-chain.js';

// Singleton for cross-module access (SF reads gate from here)
let _gateManager: GateManager | null = null;

export function getGateManager(): GateManager | null {
  return _gateManager;
}

export function setGateManager(gm: GateManager): void {
  _gateManager = gm;
}

export function createSharkGateTool(
  gateManager: GateManager,
  guardian: Guardian,
  gateEngine?: GateEngine
) {
  return tool({
    description: 'Evaluate a gate or get gate criteria. Use "status" to see current state, "criteria" to see requirements, "advance" to move forward.',
    args: {
      action: z.enum(['evaluate', 'status', 'criteria', 'advance']).describe('Action: evaluate a gate, get status, get criteria, or advance to next gate'),
      gate: z.enum(['plan', 'build', 'verify', 'test', 'audit', 'delivery']).optional().describe('Gate to evaluate or advance'),
      passed: z.boolean().optional().describe('Pass/fail result (for evaluate action)'),
      notes: z.string().optional().describe('Notes about the evaluation'),
    },
    execute: async (args, ctx) => {
      const { action, gate, passed, notes } = args;

      // BUG-4 FIX: Provide fallbacks when gateManager is cold/unavailable.
      // GateManager is always initialized in the constructor, but on first boot
      // the underlying state file may not exist yet. Return sensible defaults
      // instead of crashing.
      const safeGetGateStatuses = () => {
        try { return gateManager?.getGateStatuses?.() ?? {}; } catch { return {}; }
      };
      const safeGetCurrentGate = () => {
        try { return gateManager?.getCurrentGate?.() ?? 'plan'; } catch { return 'plan'; }
      };
      const safeGetEvidenceCollector = () => {
        try { return gateManager?.getEvidenceCollector?.() ?? null; } catch { return null; }
      };

      if (action === 'status') {
        const statuses = safeGetGateStatuses();
        const current = safeGetCurrentGate();
        // Include GateEngine evidence status if available
        let engineStatus = null;
        if (gateEngine) {
          const check = gateEngine.canAdvance();
          engineStatus = {
            currentGate: gateEngine.getCurrentGate(),
            canAdvance: check.allowed,
            missingEvidence: check.missing,
            failedEvidence: check.failed,
          };
        }
        return JSON.stringify({ statuses, currentGate: current, engine: engineStatus }, null, 2);
      }

      if (action === 'criteria') {
        const targetGate = gate || safeGetCurrentGate();
        const criteria = gateManager?.getCriteria?.(targetGate) ?? { gate: targetGate, blockingCriteria: [], evidenceRequired: [] };
        // Include GateEngine criteria if available
        let engineCriteria = null;
        if (gateEngine) {
          engineCriteria = gateEngine.getCriteria(targetGate as GateID);
        }
        return JSON.stringify({ criteria, engineCriteria }, null, 2);
      }

      if (action === 'advance') {
        // FIX: Auto-advance to next gate when no gate is specified.
        // Previously: no gate → error. Now: no gate → determine the next gate
        // in the sequence automatically.
        let targetGate: string | undefined = gate;

        if (!targetGate || targetGate === 'null' || targetGate === 'undefined' || targetGate === '') {
          const currentGate = safeGetCurrentGate();
          const currentIdx = GATE_ORDER.indexOf(currentGate);
          if (currentIdx === -1 || currentIdx >= GATE_ORDER.length - 1) {
            return JSON.stringify({
              error: `Cannot advance: already at final gate ('${currentGate}') or unknown gate`,
              currentGate,
            });
          }
          targetGate = GATE_ORDER[currentIdx + 1];
        }

        // Guard: can't advance to the same gate you're already on
        const currentGateNow = safeGetCurrentGate();
        if (targetGate === currentGateNow) {
          const idx = GATE_ORDER.indexOf(currentGateNow);
          const nextGate = (idx >= 0 && idx < GATE_ORDER.length - 1) ? GATE_ORDER[idx + 1] : null;
          return JSON.stringify({
            error: `Already on '${targetGate}' gate. Use "advance" without specifying a gate to advance to the next one.`,
            currentGate: currentGateNow,
            hint: nextGate ? `Next gate is: ${nextGate}` : 'No next gate (already at final gate)',
          });
        }

        // Verify Merkle chain integrity — warn but do NOT block advancement
        try {
          const mc = getMerkleChain();
          if (mc && typeof mc.verifyChain === 'function') {
            const chainStatus = mc.verifyChain();
            if (!chainStatus.valid) {
              console.warn(`[shark-gate] Merkle chain has ${chainStatus.brokenLinks} broken links — continuing anyway`);
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`[shark-gate] Merkle chain verification error: ${message} — continuing anyway`);
        }
        // Evidence gating is handled by GateManager.transitionTo()

        // Mark current gate as passed (reality check happens inside)
        const passResult = gateManager.passCurrentGate();
        if (!passResult.verified) {
          return JSON.stringify({
            error: `Gate ${gateManager.getCurrentGate()} reality check failed: ${passResult.reason}`,
            recoveryGate: passResult.recoveryGate
          }, null, 2);
        }

        const result = gateManager.transitionTo(targetGate!);
        return JSON.stringify({ transition: result }, null, 2);
      }

      if (action === 'evaluate') {
        if (!gate) {
          return JSON.stringify({ error: 'Gate required for evaluate action' });
        }

        const evidence = safeGetEvidenceCollector();
        // Defensive guard: getLatestEvidence is only valid on a real EvidenceCollector
        const gateEvidence = evidence && typeof evidence.getLatestEvidence === 'function'
          ? evidence.getLatestEvidence(gate)
          : null;
        
        if (passed !== undefined) {
          if (evidence && typeof evidence.collectEvidence === 'function') {
            evidence.collectEvidence({
              gate,
              timestamp: Date.now(),
              passed: passed!,
              files: [],
              metadata: { notes },
            });
          }

          if (passed) {
            gateManager?.passCurrentGate?.();
            // ANTI-CHEAT: Do NOT auto-register GateEngine evidence here.
            //
            // The old code blindly submitted ALL required evidence for the
            // gate as `true` (e.g. for audit: spec-alignment=true,
            // test-authenticity=true, theatrical-scan=true) WITHOUT reading
            // any actual report values. This allowed the agent to bypass all
            // evidence verification by simply calling:
            //   shark-gate action=evaluate gate=audit passed=true
            //
            // Evidence must come from ACTUAL tool outputs (via
            // autoCollectEvidence in tool-after-handler.ts) which reads the
            // real report values before registering anything.
            //
            // The EvidenceCollector.collectEvidence() call above (line 153)
            // records the manual evaluation result for audit trail purposes,
            // but GateEngine evidence remains unsatisfied until real tools
            // produce verified evidence.
          } else {
            gateManager?.failCurrentGate?.();
          }
        }

        const result = {
          gate,
          evaluated: true,
          passed: passed ?? gateEvidence?.passed ?? false,
          iteration: (() => { try { return gateManager?.getCurrentIteration?.() ?? 'V1.0'; } catch { return 'V1.0'; } })(),
        };

        return JSON.stringify(result, null, 2);
      }

      return JSON.stringify({ error: 'Unknown action' });
    },
  });
}
