import { tool } from '@opencode-ai/plugin';
import { z } from 'zod';
import type { StateStore } from '../shared/state-store.js';
import type { GateManager } from '../shared/gates.js';
import type { EvidenceCollector } from '../shared/evidence.js';

export function createSharkStatusTool(
  stateStore: StateStore,
  gateManager: GateManager,
  variant: 'shark' | 'macro' = 'shark'
) {
  return tool({
    description: 'Show current Shark V4 state: brain, gate, iteration, and evidence status',
    args: {},
    execute: async () => {
      // BUG-4 FIX: Provide fallbacks when gate manager state is cold/unavailable.
      // On first boot the gate state file may not exist yet, and gateManager
      // methods should not crash the tool.
      let gateState: Record<string, unknown> = {};
      let currentGate = 'initializing';
      let iteration = 'V1.0';
      try {
        gateState = (gateManager?.getState() as Record<string, unknown>) || {};
        currentGate = gateManager?.getCurrentGate?.() || 'initializing';
        iteration = gateManager?.getCurrentIteration?.() || 'V1.0';
      } catch {
        // cold state — use defaults above
      }

      let brainState = 'initializing';
      if (variant === 'shark') {
        const microState = stateStore?.get<Record<string, unknown>>('shark-micro-state', 'shark-state');
        brainState = String(microState?.currentBrain || 'initializing');
      } else {
        const macroState = stateStore?.get<Record<string, unknown>>('shark-macro-state', 'shark-state');
        brainState = (macroState?.activeBrains as string[] | undefined)?.join(', ') || 'initializing';
      }

      let evidence: EvidenceCollector | null = null;
      try {
        evidence = gateManager?.getEvidenceCollector?.() || null;
      } catch {
        evidence = null;
      }
      const evidenceStatus: Record<string, boolean> = {};
      const gates = ['plan', 'build', 'test', 'verify', 'audit', 'delivery'] as const;

      for (const gate of gates) {
        const latest = evidence && typeof evidence.getLatestEvidence === 'function'
          ? evidence.getLatestEvidence(gate)
          : null;
        evidenceStatus[gate] = latest?.passed || false;
      }

      const status = {
        variant,
        brain: brainState,
        currentGate,
        iteration,
        gateStatuses: gateState?.gateStatus ?? {},
        evidenceStatus,
        verifyAttempts: gateState?.verifyAttempts ?? {},
      };

      return JSON.stringify(status, null, 2);
    },
  });
}
