/**
 * Session Compacting Hook — context survival across compactions
 *
 * Injects build context into output array for post-compaction re-injection.
 * Uses CompactionManager for full 9-anchor flush + token estimation.
 *
 * Manta v2.2 pattern: output.context push + session state save
 */

import type { Hooks } from '@opencode-ai/plugin';
import { GateManager } from '../../shared/gates.js';
import { getCompactionManager } from '../../shared/autonomous-survival.js';
import { isSharkAgent } from '../../shared/agent-identity.js';
import { logInfo } from '../../shared/shark-logger.js';
import { getCurrentAgent } from './agent-state.js';
import { getPlanningBrain } from '../../shark/planning-brain/index.js';
import { hookRegistry, getWarhead } from '../../shared/warhead-synthesizer.js';
import { RecoveryTracker } from '../../shared/warheads/recovery-tracker.js';
import { exportPseOccurrences } from '../../eie/pse-loop-prevention.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

export function createCompactingHook(
  gateManager: GateManager
): Hooks['experimental.session.compacting'] {
  return async (input: Record<string, unknown>, output: Record<string, unknown>) => {
    const agentName = getCurrentAgent();
    if (!agentName || !isSharkAgent(agentName)) return;

    const sessionID = String(input.sessionID || '');

    // Save session gate state
    try {
      const sessionDir = path.join(process.cwd(), '.shark', 'sessions', sessionID);
      fs.mkdirSync(sessionDir, { recursive: true });
      fs.writeFileSync(
        path.join(sessionDir, 'gate-state.json'),
        JSON.stringify(gateManager.getState(), null, 2),
        'utf-8'
      );
    } catch (err) {
      // Session gate state save failure is non-fatal because:
      // 1. Compaction is an opencode runtime event we can't control — it fires
      //    when the context window fills, independent of our state.
      // 2. Losing the serialized gate state means the post-compaction session
      //    must rebuild gate state from scratch (re-derive current gate), but
      //    the session itself continues normally.
      // 3. The worst case is engines need to rebuild state from scratch — no
      //    data corruption, no session crash.
      logInfo('[compacting-hook] Session gate state serialization failed (non-fatal): ' +
              (err instanceof Error ? err.message : String(err)));
      // Don't re-throw — compaction must not break the session
    }

    // Save planning brain state (loop state, verification matrix)
    try {
      const planningBrain = getPlanningBrain();
      if (planningBrain && planningBrain.enabled) {
        const brainState = planningBrain.saveState();
        const sessionDir = path.join(process.cwd(), '.shark', 'sessions', sessionID);
        fs.mkdirSync(sessionDir, { recursive: true });
        fs.writeFileSync(
          path.join(sessionDir, 'planning-brain-state.json'),
          JSON.stringify(brainState, null, 2),
          'utf-8'
        );
      }
    } catch (err) {
      // Planning brain state save failure is non-fatal because:
      // 1. The planning brain is a context-acceleration layer; without its
      //    serialized state, post-compaction it simply re-acquires context
      //    from the live session (slower, but correct).
      // 2. The decision chain persists to disk independently (see planning-brain-registry),
      //    so no decisions are lost — only the in-memory snapshot.
      // 3. File system errors (ENOSPC, EACCES) on this write must not crash
      //    the compaction handler.
      logInfo('[compacting-hook] Planning brain state save failed (non-fatal): ' +
              (err instanceof Error ? err.message : String(err)));
      // Don't re-throw — planning brain recovery is handled elsewhere
    }

    // Save PSE loop occurrence state for graduated escalation compaction survival (spec §8.3)
    try {
      const pseOccurrences = exportPseOccurrences();
      if (Object.keys(pseOccurrences).length > 0) {
        const sessionDir = path.join(process.cwd(), '.shark', 'sessions', sessionID);
        fs.mkdirSync(sessionDir, { recursive: true });
        fs.writeFileSync(
          path.join(sessionDir, 'pse-occurrences.json'),
          JSON.stringify({ occurrences: pseOccurrences, exportedAt: Date.now() }, null, 2),
          'utf-8'
        );
      }
    } catch (err) {
      logInfo('[compacting-hook] PSE occurrence state save failed (non-fatal): ' +
              (err instanceof Error ? err.message : String(err)));
    }

    // Update RecoveryTracker checkpoint BEFORE compaction — includes current gate state
    try {
      const recW = getWarhead('recovery-tracker');
      if (recW && recW instanceof RecoveryTracker) {
        const gateState = gateManager.getState() as { currentGate: string };
        const currentGate = (gateState.currentGate || 'PLAN').toUpperCase();
        recW.setCheckpoint(
          new Date().toISOString(),
          `GATE=${currentGate} docs: COMPACTION_SURVIVAL.md + BUILD_STATE.md`
        );
      }
    } catch (err) {
      // RecoveryTracker checkpoint failure is non-fatal because:
      // 1. The checkpoint is a best-effort convenience marker for crash recovery;
      //    its absence does not affect the current session's correctness.
      // 2. RecoveryTracker also persists to disk on its own cadence, so a missed
      //    pre-compaction checkpoint is recoverable from the last successful one.
      // 3. A TypeError here (warhead not registered / wrong class) is expected
      //    in sessions where RecoveryTracker is not installed.
      logInfo('[compacting-hook] RecoveryTracker checkpoint failed (non-fatal): ' +
              (err instanceof Error ? err.message : String(err)));
      // Don't re-throw — checkpoint is best-effort
    }

    // Use CompactionManager for full 9-anchor flush + context push
    const cm = getCompactionManager();
    cm.setGateManager(gateManager);
    cm.onCompacting(output as { context: string[] });

    // Fire warhead hooks (compacting event)
    try {
      await hookRegistry.fire('compacting', input, output);
    } catch (err) {
      // Warhead hook fire failure is non-fatal because:
      // 1. Warheads are pluggable, third-party-style handlers; a bug in one
      //    must not prevent the core compaction context push from completing.
      // 2. The logInfo call below preserves the error for diagnosis.
      // 3. The hook registry itself isolates each warhead, but we double-catch
      //    here to guarantee the session continues after compaction.
      logInfo('[compacting-hook] Warhead registry compacting hook error (non-fatal): ' +
              (err instanceof Error ? err.message : String(err)));
      // Don't re-throw — warhead failures are isolated best-effort
    }

    // v5.1.0: Inject runtime-grade enforcement + planning brain state into post-compaction context
    const contextArr = (output as { context?: string[] }).context;
    if (Array.isArray(contextArr)) {
      contextArr.push(
        '[SHARK v5.1.0 POST-COMPACTION] RUNTIME-GRADE ENGINEERING is ABSOLUTE. Theatrical code is NOT PERMITTED. Every function handles errors in ALL paths. Every input is validated at boundaries. Every resource is cleaned up in ALL code paths. Resume from current gate in COMPACTION_SURVIVAL.md.',
        `[SHARK v5.1.0 POST-COMPACTION] Session ${sessionID} gate state preserved at .shark/sessions/${sessionID}/gate-state.json`,
        `[SHARK v5.1.0 POST-COMPACTION] Planning brain state preserved at .shark/sessions/${sessionID}/planning-brain-state.json`,
      );
    }
  };
}
