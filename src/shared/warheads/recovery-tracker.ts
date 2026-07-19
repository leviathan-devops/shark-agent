/**
 * Warhead #9: RecoveryTracker (priority 9) — DYNAMIC, CONDITIONAL
 *
 * Tracks checkpoint state for session recovery.
 * Returns empty T0() when no checkpoint is set.
 */
import type { SharkWarhead, HookRegistry } from '../warhead-registry.js';

export class RecoveryTracker implements SharkWarhead {
  readonly id = 'recovery-tracker';
  readonly priority = 9;
  readonly type = 'dynamic' as const;

  private checkpointTime: string | null = null;
  private checkpointDoc: string | null = null;

  register(_hooks: HookRegistry): void {
    // Dynamic warhead — no hooks registered
  }

  setCheckpoint(time: string, doc: string): void {
    if (typeof time !== 'string' || time.length === 0) {
      console.error('[RecoveryTracker] setCheckpoint() called with invalid time');
      return;
    }
    this.checkpointTime = time;
    this.checkpointDoc = doc;
  }

  getT0(): string {
    if (!this.checkpointTime) return '';
    return `[RECOVERY] Checkpoint: ${this.checkpointTime}`;
  }
}
