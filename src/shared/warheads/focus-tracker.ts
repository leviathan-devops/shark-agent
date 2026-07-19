/**
 * Warhead #8: FocusTracker (priority 8) — DYNAMIC
 *
 * Tracks current task, reasoning, and next step.
 * State is updated externally via update().
 */
import type { SharkWarhead, HookRegistry } from '../warhead-registry.js';
import { isRecord, safeGetString, safeGetRecord } from '../type-guards.js';
import { shouldEnforceForAgent } from '../agent-identity.js';

export class FocusTracker implements SharkWarhead {
  readonly id = 'focus-tracker';
  readonly priority = 8;
  readonly type = 'dynamic' as const;

  private task: string = 'initializing';
  private reasoning: string = 'awaiting assignment';
  private next: string = 'awaiting assignment';

  register(hooks: HookRegistry): void {
    // HOOK: Track active task from todowrite calls
    hooks.on('tool.execute.after', (input: unknown, output: unknown) => {
      if (!isRecord(input)) return;
      const ti = input as { tool?: string; agent?: string };
      if (!shouldEnforceForAgent(ti.agent)) return;
      if (ti.tool !== 'todowrite') return;

      const argsVal = isRecord(output) ? output.args : null;
      const args = isRecord(argsVal) ? argsVal : null;
      if (!args) return;
      const todos = args.todos;
      if (!Array.isArray(todos)) return;

      const active = todos.find((t: unknown) => t && typeof t === 'object' && (t as Record<string, unknown>).status === 'in_progress');
      if (active && active.content) {
        this.task = active.content;
        this.reasoning = 'gate=' + (isRecord(input) ? safeGetString(input, 'gate', 'active task') : 'active task');
        this.next = 'Continue: ' + active.content;
      }
    });
  }

  update(task: string, reasoning: string, next: string): void {
    if (typeof task !== 'string' || task.length === 0) {
      console.error('[FocusTracker] update() called with invalid task');
      return;
    }
    this.task = task;
    this.reasoning = reasoning;
    this.next = next;
  }

  getT0(): string {
    return `[FOCUS] Task: ${this.task} | Next: ${this.next}`;
  }
}
