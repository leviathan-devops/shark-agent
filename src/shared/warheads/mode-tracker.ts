/**
 * Warhead #7: ModeTracker (priority 7) — DYNAMIC
 *
 * Tracks current gate, iteration, uptime, and tool call count.
 * Tool calls auto-tracked via hook. Gate/iteration updated externally via update().
 */
import type { SharkWarhead, HookRegistry } from '../warhead-registry.js';
import { isSharkAgent } from '../agent-identity.js';

export class ModeTracker implements SharkWarhead {
  readonly id = 'mode-tracker';
  readonly priority = 7;
  readonly type = 'dynamic' as const;

  private currentGate: string = 'PLAN';
  private currentIteration: string = 'V1.0';
  private readonly sessionStart: number = Date.now();
  private toolCallsThisSession: number = 0;

  register(hooks: HookRegistry): void {
    // Auto-track tool calls on every tool.execute.after
    hooks.on('tool.execute.after', (input: unknown) => {
      const agent = (input as Record<string, unknown>)?.agent as string | undefined;
      if (!agent || !isSharkAgent(agent)) return;
      this.toolCallsThisSession++;
    });
  }

  update(gate: string, iteration: string): void {
    if (typeof gate !== 'string' || gate.length === 0) {
      console.error('[ModeTracker] update() called with invalid gate');
      return;
    }
    this.currentGate = gate;
    this.currentIteration = iteration;
  }

  /**
   * @unused — tool calls auto-increment via tool.execute.after hook (register method).
   * Retained for manual override if needed (e.g., testing or replay).
   */
  incrementToolCalls(): void {
    this.toolCallsThisSession++;
  }

  getT0(): string {
    return `[MODE] Gate: ${this.currentGate} | Iteration: ${this.currentIteration} | Calls: ${this.toolCallsThisSession}`;
  }
}
