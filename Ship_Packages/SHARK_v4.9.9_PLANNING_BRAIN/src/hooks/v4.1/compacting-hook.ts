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
import { getCurrentAgent } from './agent-state.js';
import { getPlanningBrain } from '../../shark/planning-brain/index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

export function createCompactingHook(
  gateManager: GateManager
): Hooks['experimental.session.compacting'] {
  return async (input, output) => {
    const agentName = getCurrentAgent();
    if (!agentName || !isSharkAgent(agentName)) return;

    const { sessionID } = input;

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
      // Silent fail — non-critical
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
    } catch {
      // Non-fatal — planning brain state save failure
    }

    // Use CompactionManager for full 9-anchor flush + context push
    const cm = getCompactionManager();
    cm.setGateManager(gateManager);
    cm.onCompacting(output as { context: string[] });

    // v4.9.9: Inject runtime-grade enforcement + planning brain state into post-compaction context
    const contextArr = (output as { context?: string[] }).context;
    if (Array.isArray(contextArr)) {
      contextArr.push(
        '[SHARK v4.9.9 POST-COMPACTION] RUNTIME-GRADE ENGINEERING is ABSOLUTE. Theatrical code is NOT PERMITTED. Every function handles errors in ALL paths. Every input is validated at boundaries. Every resource is cleaned up in ALL code paths. Resume from current gate in COMPACTION_SURVIVAL.md.',
        `[SHARK v4.9.9 POST-COMPACTION] Session ${sessionID} gate state preserved at .shark/sessions/${sessionID}/gate-state.json`,
        `[SHARK v4.9.9 POST-COMPACTION] Planning brain state preserved at .shark/sessions/${sessionID}/planning-brain-state.json`,
      );
    }
  };
}
