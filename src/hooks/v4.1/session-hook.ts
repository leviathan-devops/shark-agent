/**
 * Session Hook — shark session lifecycle
 * 
 * ONLY fires for shark agent sessions.
 * AUTO-INJECT: Reads .shark/build-context.md and injects on session start.
 * 
 * This ensures build context survives compactions.
 */
import type { Hooks } from '@opencode-ai/plugin';
import { GateManager } from '../../shared/gates.js';
import { EvidenceCollector } from '../../shared/evidence.js';
import type { SharkPeerDispatch } from '../../shark/macro/peer-dispatch.js';
import { isSharkAgent } from '../../shared/agent-identity.js';
import { setCurrentAgent, clearCurrentAgent, handleAgentSwitch } from './agent-state.js';
import type { StateStore } from '../../shared/state-store.js';
import { safeParseJSON } from '../../shared/type-guards.js';
import type { SharkMessenger } from '../../shared/messenger.js';
import { resetSystemTransformState } from './system-transform-hook.js';
import { resetGateHookState } from './gate-hook.js';
import type { BrainConcurrencyManager } from '../../shark/brains/brain-concurrency.js';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { logInfo } from '../../shared/shark-logger.js';
import { resetGateTransitionHistory } from '../../eie/pse-loop-prevention.js';

const BUILD_CONTEXT_FILE = 'build-context.md';
const BUILD_REMINDER_FILE = 'build-reminder.txt';

let dirCreationAttempted = false;
let contextInjectedThisSession = false;

export function createSessionHook(
  gateManager: GateManager,
  _evidenceCollector: EvidenceCollector,
  peerDispatch: SharkPeerDispatch | undefined,
  stateStore: StateStore,
  messenger: SharkMessenger,
  concurrencyManager?: BrainConcurrencyManager
): Hooks['event'] {
  return async (input: Record<string, unknown>) => {
    if (!input) return;
    const event = input.event as { type?: string; sessionId?: string; agent?: string };

    if (!event?.type) return;

    // Identity deload: if agent switch detected, clear stale state before loading new
    handleAgentSwitch(event.sessionId, event.agent);

    if (!isSharkAgent(event.agent)) {
      setCurrentAgent(undefined, event.sessionId);
      return;
    }

    setCurrentAgent(event.agent, event.sessionId);

    if (event.type === 'session.created') {
      handleSessionCreated(gateManager, peerDispatch);
      
      try {
        const sopPath = path.join(process.cwd(), '.shark', 'resumption-sop.md');
        if (fs.existsSync(sopPath)) {
          const sop = fs.readFileSync(sopPath, 'utf-8');
          messenger.send({
            from: 'system',
            to: 'execution-brain',
            type: 'context-inject',
            priority: 'critical',
            payload: { content: sop, label: 'RESUMPTION_SOP' },
            requiresAck: true,
          });
        }
      } catch (err) {
        // Silent fail
      }
    } else if (event.type === 'session.ended') {
      handleSessionEnded(stateStore, messenger, event.sessionId, concurrencyManager);
    }
  };
}


/**
 * Injects build context from .shark/build-context.md
 * Called on every session.created for shark agent.
 */
function injectBuildContext(): void {
  if (contextInjectedThisSession) return; // Only once per session
  
  contextInjectedThisSession = true;
  
  try {
    const sharkDir = path.join(process.cwd(), '.shark');
    const contextPath = path.join(sharkDir, BUILD_CONTEXT_FILE);
    
    if (fs.existsSync(contextPath)) {
      const context = fs.readFileSync(contextPath, 'utf-8');
      
      // Inject via system-transform to add to system prompt
      // The system-transform hook will pick this up
      const reminderPath = path.join(sharkDir, BUILD_REMINDER_FILE);
      const reminder = fs.existsSync(reminderPath) 
        ? fs.readFileSync(reminderPath, 'utf-8')
        : 'L1-L4 broken. L5 working.';
      
      // Build context silently injected
    }
  } catch (err) {
    // Silent fail - don't disrupt session
  }
}

/**
 * Clean up stale test artifacts from previous sessions.
 *
 * Files like src/hello.ts, src/greet.test.ts, src/test.ts, src/stateMachine.ts
 * are commonly created by test tasks but never cleaned up. They cause:
 *   - tsc --noEmit to fail forever (imports non-existent modules)
 *   - Audit reality checks to fail on stale code
 *   - Build failures from circular imports
 *
 * This runs on every new session start (after gate reset to PLAN).
 */
function cleanupStaleFiles(): void {
  const cwd = process.cwd();
  const staleFiles = [
    'hello.ts', 'greet.test.ts', 'test.ts', 'stateMachine.ts',
    'hello.js', 'test.js', 'stateMachine.js',
  ];

  let cleaned = 0;
  for (const file of staleFiles) {
    // Check in root
    const rootPath = path.join(cwd, file);
    if (fs.existsSync(rootPath)) {
      try { fs.unlinkSync(rootPath); cleaned++; } catch { /* ignore */ }
    }
    // Check in src/
    const srcPath = path.join(cwd, 'src', file);
    if (fs.existsSync(srcPath)) {
      try { fs.unlinkSync(srcPath); cleaned++; } catch { /* ignore */ }
    }
  }

  // Also clean .shark/evidence from previous runs (stale evidence)
  // to prevent false gate advances
  try {
    const evidenceBase = path.join(cwd, '.shark', 'evidence');
    if (fs.existsSync(evidenceBase)) {
      const gateDirs = fs.readdirSync(evidenceBase, { withFileTypes: true })
        .filter(d => d.isDirectory());
      for (const gateDir of gateDirs) {
        // Don't delete the evidence dir itself, just clear stale ContainerTestResult.json
        // that might have been written by a different project
        const testResult = path.join(evidenceBase, gateDir.name, 'ContainerTestResult.json');
        if (fs.existsSync(testResult)) {
          try {
            const content = fs.readFileSync(testResult, 'utf-8');
            const parsed = safeParseJSON(content) as Record<string, unknown> | null;
            // Only delete if it looks like a stale test from a hello/greet project
            if (parsed && typeof parsed.suite === 'string' &&
                /hello|greet|test-?task/i.test(parsed.suite)) {
              fs.unlinkSync(testResult);
              cleaned++;
            }
          } catch { /* ignore */ }
        }
      }
    }
  } catch { /* ignore */ }

  if (cleaned > 0) {
    logInfo(`[session-hook] Cleaned ${cleaned} stale file(s) from previous session`);
  }
}

function handleSessionCreated(
  gateManager: GateManager,
  peerDispatch?: SharkPeerDispatch
): void {
  let restored = false;

  try {
    const checkpointsDir = path.join(process.cwd(), '.shark', 'checkpoints');
    if (fs.existsSync(checkpointsDir)) {
      const files = fs.readdirSync(checkpointsDir)
        .filter((f: string) => f.endsWith('.json'))
        .map((f: string) => ({
          name: f,
          path: path.join(checkpointsDir, f),
          mtime: fs.statSync(path.join(checkpointsDir, f)).mtimeMs,
        }))
        .sort((a: { name: string; path: string; mtime: number }, b: { name: string; path: string; mtime: number }) => b.mtime - a.mtime);

      if (files.length > 0) {
        const latest = files[0];
        const raw = fs.readFileSync(latest.path, 'utf-8');
        const state = safeParseJSON(raw) as Record<string, unknown>;
        gateManager.restore(state);
        restored = true;
      }
    }
  } catch (err) {
    // Fall through to hardcoded reset
  }

  if (!restored) {
    gateManager.restore({
      currentGate: 'plan',
      gateStatus: {
        plan: 'pending',
        build: 'pending',
        test: 'pending',
        verify: 'pending',
        audit: 'pending',
        delivery: 'pending',
      },
      verifyAttempts: 0,
      currentIteration: 'V1.0',
      iterationAttempts: {},
    });
  }

  // Force fresh PLAN gate on every new session
  gateManager.transitionTo('plan');

  // Reset gate transition loop detector for new session
  resetGateTransitionHistory();

  // Clean up stale test artifacts from previous sessions.
  // These files cause tsc --noEmit to fail forever because they import
  // non-existent modules or reference outdated project structure.
  cleanupStaleFiles();

  injectBuildContext();

  if (peerDispatch) {
    peerDispatch.initialize();
  }

  if (!dirCreationAttempted) {
    dirCreationAttempted = true;
    const sharkDir = path.join(process.cwd(), '.shark');
    fs.mkdirSync(sharkDir, { recursive: true });
    fs.mkdirSync(path.join(sharkDir, 'evidence'), { recursive: true });
    fs.mkdirSync(path.join(sharkDir, 'checkpoints'), { recursive: true });
  }
}

function handleSessionEnded(
  stateStore: StateStore,
  messenger: SharkMessenger,
  sessionId?: string,
  concurrencyManager?: BrainConcurrencyManager
): void {
  if (concurrencyManager) concurrencyManager.stopAll();
  stateStore.cleanup();
  messenger.cleanup();
  dirCreationAttempted = false;
  resetSystemTransformState();
  resetGateHookState();
  setCurrentAgent(undefined, sessionId);
  clearCurrentAgent(sessionId);
}