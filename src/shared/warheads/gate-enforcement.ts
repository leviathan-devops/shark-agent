/**
 * Warhead #2: GateEnforcement (priority 2)
 *
 * Tracks gate transitions and blocks.
 * Provides live T0() with current gate state and counters.
 */
import type { SharkWarhead, HookRegistry } from '../warhead-registry.js';
import { isRecord, EnforcementError } from '../warhead-registry.js';
import { isSharkAgent, shouldEnforceForAgent } from '../agent-identity.js';
import { getGateMachineXState } from '../../gate-engine/gate-machine-xstate.js';
import { getGateManager } from '../../tools/shark-gate.js';
import { VerbFrameLexicon } from '../../shark/karpathy/verb-frame-lexicon.js';

/** Maximum history entries to prevent unbounded memory growth */
const MAX_GATE_HISTORY = 50;

export class GateEnforcement implements SharkWarhead {
  readonly id = 'gate-enforcement';
  readonly priority = 2;
  readonly type = 'static' as const;

  private gateTransitions = 0;
  private gateBlocks = 0;
  private currentGate: string = 'PLAN';
  private currentIteration: string = 'V1.0';
  private consecutiveBlocks: Record<string, number> = {};
  private lockedGates: Set<string> = new Set();

  register(hooks: HookRegistry): void {
    // HOOK: Track gate transitions from gate-hook.ts
    hooks.on('tool.execute.after', (input: unknown) => {
      if (!isRecord(input)) return;
      const toolInput = input as { tool?: string; args?: Record<string, unknown>; agent?: string };
      if (!toolInput.tool) return;

      // Agent filter
      const agent = toolInput.agent || '';
      if (!isSharkAgent(agent)) return;

      if (toolInput.tool === 'shark-gate') {
        try {
          const args = toolInput.args;
          if (!isRecord(args)) return;
          const action = typeof args.action === 'string' ? args.action : '';
          if (action === 'advance') {
            this.gateTransitions++;
            // Update displayed gate name from tool args
            const gateName = typeof args.gate === 'string' ? args.gate : '';
            const iteration = typeof args.iteration === 'string' ? args.iteration : '';
            if (gateName) {
              this.currentGate = gateName.toUpperCase();
            }
            if (iteration) {
              this.currentIteration = iteration;
            }
            if (this.gateTransitions > MAX_GATE_HISTORY) {
              console.warn('[GateEnforcement] Transition count exceeding history limit');
            }
            // Dispatch ALLOW to XState machine
            const xgm = getGateMachineXState();
            if (xgm) {
              xgm.dispatch({ type: 'ALLOW', payload: { gateName, iteration }, timestamp: new Date().toISOString() });
            }
          }
          if (action === 'evaluate' && args.passed === false) {
            this.gateBlocks++;
            // Dispatch BLOCK to XState machine
            const xgm = getGateMachineXState();
            if (xgm) {
              xgm.dispatch({ type: 'BLOCK', payload: { reason: args.reason }, timestamp: new Date().toISOString() });
            }
            // ── Escalation: LOCKOUT after 3 consecutive blocks ──
            const gate = this.currentGate;
            this.consecutiveBlocks[gate] = (this.consecutiveBlocks[gate] || 0) + 1;
            if (this.consecutiveBlocks[gate] >= 3 && !this.lockedGates.has(gate)) {
              this.lockedGates.add(gate);
              if (xgm) {
                xgm.dispatch({ type: 'LOCKOUT', payload: { gate, consecutiveBlocks: this.consecutiveBlocks[gate] }, timestamp: new Date().toISOString() });
              }
            }
          }
          if (action === 'evaluate' && args.passed === true) {
            // Dispatch PASS to XState machine
            const xgm = getGateMachineXState();
            if (xgm) {
              xgm.dispatch({ type: 'PASS', payload: { evidenceId: args.evidenceId }, timestamp: new Date().toISOString() });
            }
            // ── Recovery: RESTART after lockout cleared ──
            const gate = this.currentGate;
            this.consecutiveBlocks[gate] = 0;
            if (this.lockedGates.has(gate)) {
              this.lockedGates.delete(gate);
              if (xgm) {
                xgm.dispatch({ type: 'RESTART', payload: { gate }, timestamp: new Date().toISOString() });
              }
            }
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[GateEnforcement] Gate tracking error: ${message}`);
        }
      }
    });

    // HOOK: Enforce gate-tool compatibility before execution
    hooks.on('tool.execute.before', async (input: unknown) => {
      if (!isRecord(input)) return;
      const ti = input as { tool?: string; agent?: string };
      if (!ti.tool) return;
      if (!shouldEnforceForAgent(ti.agent)) return;

      // Check gate-tool compatibility using VerbFrameLexicon
      try {
        const gm = getGateManager();
        if (!gm) return;
        const gate = gm.getCurrentGate();
        const lexicon = new VerbFrameLexicon();
        if (!lexicon.isAllowedInGate(ti.tool, gate)) {
          this.gateBlocks++;
          throw new EnforcementError(
            `[GATE] Tool "${ti.tool}" not allowed in ${gate.toUpperCase()} gate. Switch to the appropriate gate first.`,
          );
        }
      } catch (e) {
        if (e instanceof EnforcementError) throw e;
        // Non-fatal — lexicon check failure should not break tool execution
      }
    });
  }

  getT0(): string {
    const lockedInfo = this.lockedGates.size > 0 
      ? `, LOCKED: ${[...this.lockedGates].join(',')}` 
      : '';
    return `[GATE] Current: ${this.currentGate} | Transitions: ${this.gateTransitions} | Blocks: ${this.gateBlocks}${lockedInfo}`;
  }
}
