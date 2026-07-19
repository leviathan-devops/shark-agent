/**
 * Warhead Synthesizer — Registry Singleton
 *
 * Wires all 11 warheads together, provides T1 injectables
 * for system prompt injection.
 */
import type { SharkWarhead } from './warhead-registry.js';
import { HookRegistry } from './warhead-registry.js';
import { RuntimeGradeEngineer } from './warheads/runtime-grade-engineer.js';
import { IdentityEnforcement } from './warheads/identity-enforcement.js';
import { GateEnforcement } from './warheads/gate-enforcement.js';
import { ContainerTesting } from './warheads/container-testing.js';
import { EvidencePipeline } from './warheads/evidence-pipeline.js';
import { CrossPluginIsolation } from './warheads/cross-plugin-isolation.js';
import { TheatricalCodeBlock } from './warheads/theatrical-code-block.js';
import { ModeTracker } from './warheads/mode-tracker.js';
import { FocusTracker } from './warheads/focus-tracker.js';
import { RecoveryTracker } from './warheads/recovery-tracker.js';
import { StopGuessing } from './warheads/stop-guessing.js';

const warheads: Map<string, SharkWarhead> = new Map();
export const hookRegistry = new HookRegistry();

/**
 * Register a single warhead with the system.
 * Calls init() if present, then registers hooks.
 * Re-throws on init failure — init failure is fatal.
 */
export async function registerWarhead(w: SharkWarhead): Promise<void> {
  if (w.init) {
    try {
      await w.init();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[WarheadSynthesizer] Failed to init warhead ${w.id}: ${message}`);
      throw err;
    }
  }
  w.register(hookRegistry);
  warheads.set(w.id, w);
}

/**
 * Initialize all warheads in priority order.
 * Logs total warheads and hooks registered.
 */
export async function initializeWarheads(): Promise<void> {
  const warheadInstances: SharkWarhead[] = [
    new RuntimeGradeEngineer(),           // priority 0
    new StopGuessing(),                     // priority 0.5
    new IdentityEnforcement(),            // priority 1
    new GateEnforcement(),                // priority 2
    new ContainerTesting(),               // priority 3
    new EvidencePipeline(),               // priority 4
    new CrossPluginIsolation(),           // priority 5
    new TheatricalCodeBlock(),            // priority 6
    new ModeTracker(),                    // priority 7
    new FocusTracker(),                   // priority 8
    new RecoveryTracker(),                // priority 9
  ];

  // Sort by priority (lowest first = highest priority)
  warheadInstances.sort((a: SharkWarhead, b: SharkWarhead) => a.priority - b.priority);

  for (const w of warheadInstances) {
    await registerWarhead(w);
  }

  console.log(
    `[SHARK] ${warheads.size} warheads registered, ${hookRegistry.hookCount()} hooks active`
  );
}

/** T1 injectable status strings from all warheads */
export interface T1Injectables {
  readonly runtimeGradeEngineer: string;
  readonly identityEnforcement: string;
  readonly gateEnforcement: string;
  readonly containerTesting: string;
  readonly evidencePipeline: string;
  readonly crossPluginIsolation: string;
  readonly theatricalCodeBlock: string;
  readonly modeTracker: string;
  readonly focusTracker: string;
  readonly recoveryTracker: string;
}

/**
 * Get T1 injectables — live T0() strings from all warheads.
 * Returns empty string for any warhead that fails or is not found.
 */
export function getT1Injectables(): T1Injectables {
  const get = (id: string): string => {
    const w = warheads.get(id);
    if (!w) {
      console.error(`[WarheadSynthesizer] Warhead not found: ${id}`);
      return `[WARHEAD ${id} OFFLINE — NOT REGISTERED]`;
    }
    try {
      return w.getT0();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[WarheadSynthesizer] getT0() failed for ${id}: ${message}`);
      return `[WARHEAD ${id} OFFLINE — getT0() ERROR: ${message}]`;
    }
  };

  return {
    runtimeGradeEngineer: get('runtime-grade-engineer'),
    identityEnforcement: get('identity-enforcement'),
    gateEnforcement: get('gate-enforcement'),
    containerTesting: get('container-testing'),
    evidencePipeline: get('evidence-pipeline'),
    crossPluginIsolation: get('cross-plugin-isolation'),
    theatricalCodeBlock: get('theatrical-code-block'),
    modeTracker: get('mode-tracker'),
    focusTracker: get('focus-tracker'),
    recoveryTracker: get('recovery-tracker'),
  };
}

/** Get a specific warhead by ID */
export function getWarhead(id: string): SharkWarhead | undefined {
  return warheads.get(id);
}

/** Get total registered warhead count */
export function getWarheadCount(): number {
  return warheads.size;
}

// ---------------------------------------------------------------------------
// IDENTITY-SYNTHESIZER COMPATIBILITY LAYER
// Re-export T1Warheads-compatible getT1Injectables and hasRecoveryCheckpoint
// so system-transform-hook can import everything from this module.
// ---------------------------------------------------------------------------

export {
  synthesizeT1Injectables as synthesizeIdentityT1,
  getT1Injectables as getIdentityT1Injectables,
  hasRecoveryCheckpoint,
  getFocusState,
  updateFocusWarhead,
  updateRecoveryWarhead,
  clearRecoveryWarhead,
  getT1TotalSize,
  getSynthesizedAt,
  setSynthesizerPluginDirectory,
  resetSynthesisCache,
  loadT2Section,
  getAvailableT2Sections,
} from './identity-synthesizer.js';

// Re-export the T1Warheads type for consumers
export type { T1Warheads, T2Section } from './identity-synthesizer.js';
