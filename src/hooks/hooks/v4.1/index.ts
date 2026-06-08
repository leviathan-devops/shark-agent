/**
 * Shark Hooks v4.9 — Triple-Brain Parallel Architecture
 * WITH 3-Lobe Enforcement Brain integration.
 *
 * Enforcement pipeline:
 *   BEFORE: Frontal Lobe (Karpathy) intent detection -> BLOCK | WARN | PASS
 *   AFTER:  RGE (code quality) + SRE (mechanical verification) -> REJECT | ACCEPT
 */
import type { Hooks } from '@opencode-ai/plugin';
import { Guardian } from '../../shared/guardian.js';
import { GateManager } from '../../shared/gates.js';
import { EvidenceCollector } from '../../shared/evidence.js';
import { createGuardianHook } from './guardian-hook.js';
import { createGateHook } from './gate-hook.js';
import { createChatMessageHook } from './chat-message-hook.js';
import { createMessagesTransformHook } from './messages-transform-hook.js';
import { createCommandExecuteHook } from './command-execute-hook.js';
import { createToolSummarizerHook } from './tool-summarizer-hook.js';
import { createSessionHook } from './session-hook.js';
import { createCompactingHook } from './compacting-hook.js';
import { createSystemTransformHook } from './system-transform-hook.js';
import { safeHook } from './safe-hook.js';
import { setGateHookBrains } from './gate-hook.js';
import { SHARK_PLUGIN_IDENTITY } from '../../shared/identity-loader.js';
import type { StateStore } from '../../shared/state-store.js';
import type { SharkMessenger } from '../../shared/messenger.js';
import type { BrainConcurrencyManager } from '../../shark/brains/brain-concurrency.js';
import type { ExecutionBrain } from '../../shark/brains/execution-brain.js';
import type { SystemBrain } from '../../shark/brains/system-brain.js';
import { EnforcementBrain, StructuredBlockError } from '../../shark/enforcement-brain/index.js';
import type { EnforcementResult } from '../../shark/enforcement-brain/types.js';
import { getPlanningBrain } from '../../shark/planning-brain/index.js';
import { 
  updateThoughtStream, updateCompactionSurvival, updatePostCompactionPrompt,
  updateBuildStateOnTaskComplete, updateEvidenceState, updateDecisionChain
} from '../../shared/context-manager.js';

export function createSharkHooks(
  guardian: Guardian,
  gateManager: GateManager,
  evidenceCollector: EvidenceCollector,
  stateStore: StateStore,
  messenger: SharkMessenger,
  sharkIdentityPrompt?: string,
  sharkPluginIdentity?: { sharkAgents: Set<string> },
  concurrencyManager?: BrainConcurrencyManager,
  executionBrain?: ExecutionBrain,
  systemBrain?: SystemBrain,
  enforcementBrain?: EnforcementBrain
): Hooks {
  if (executionBrain && systemBrain) {
    setGateHookBrains(executionBrain, systemBrain);
  }
  const hookOptions = {
    pluginName: 'shark-agent',
    managedAgents: (sharkPluginIdentity ?? SHARK_PLUGIN_IDENTITY).sharkAgents,
    agentPrefix: 'shark-',
    orchestratorName: 'shark',
  };

  return {
    'event': createSessionHook(gateManager, evidenceCollector, undefined, stateStore, messenger, concurrencyManager),
    'chat.message': createChatMessageHook(),
    'command.execute.before': safeHook(createCommandExecuteHook(), hookOptions),
    'experimental.chat.messages.transform': safeHook(createMessagesTransformHook(), hookOptions),

    /* tool.execute.before: Frontal Lobe intent detection + Guardian protection */
    'tool.execute.before': async (input: any, output: any) => {
      try {
        // 1. Run Enforcement Brain (Frontal Lobe)
        if (enforcementBrain) {
          const toolName = input?.tool || '';
          const toolArgs = (output as any)?.args || {};
          const results = enforcementBrain.evaluateBefore(toolName, toolArgs);
          const blocks = results.filter((r: EnforcementResult) => r.level === 'BLOCK');
          if (blocks.length > 0) {
            throw new StructuredBlockError(blocks[0]);
          }
          const warns = results.filter((r: EnforcementResult) => r.level === 'WARN');
          if (warns.length > 0) {
            output.system = output.system || [];
            output.system.push(`[ENFORCEMENT] ${warns[0].message}`);
          }
        }
        // 1b. Run Planning Brain (before execution check)
        try {
          const planningBrain = getPlanningBrain();
          if (planningBrain) {
            const toolName = input?.tool || '';
            const toolArgs = (output as any)?.args || {};
            const result = planningBrain.onBeforeExecution(toolName, toolArgs);
            if (result.bullet) {
              output.system = output.system || [];
              output.system.push(result.bullet);
            }
          }
        } catch (err) {
          // Planning brain PSM activation throws StructuredBlockError — let it propagate
          if (err instanceof StructuredBlockError) throw err;
          // Other planning brain errors are non-fatal
        }

        // 2. Run Guardian hook (existing)
        const guardianHandler = createGuardianHook(guardian, gateManager);
        if (guardianHandler) {
          await guardianHandler(input, output);
        }
      } catch (err) {
        // AUTONOMOUS DEBUG LOG — log enforcement blocks to context docs before re-throwing
        try {
          const { updateDebugLog, updateSoCPreservation } = await import('../../shared/context-manager.js');
          const toolName = input?.tool || 'unknown';
          const errMsg = err instanceof Error ? err.message : String(err);
          updateDebugLog('enforcement-block', `Blocked: ${toolName}`, errMsg, 
            `Layer: guardian-hook`, `Enforcement block: ${toolName} — ${errMsg}`);
          updateSoCPreservation([{ pattern: `Enforcement block: ${toolName}`, 
            context: errMsg, source: 'guardian-hook' }]);
        } catch (logErr) {
          console.error(`[EnforcementCatch] Failed to log enforcement block: ${logErr instanceof Error ? logErr.message : String(logErr)}`);
        }
        throw err;
      }
    },

    /* tool.execute.after: RGE code quality + SRE mechanical verification */
    'tool.execute.after': async (input: any, output: any) => {
      const toolName = input?.tool || '';
      const toolArgs = (output as any)?.args || {};

      // 1. Run Enforcement Brain (RGE + SRE)
      if (enforcementBrain) {
        const results = await enforcementBrain.evaluateAfter(toolName, toolArgs, output);
        const blocks = results.filter((r: EnforcementResult) => r.level === 'BLOCK');
        if (blocks.length > 0) {
          output.system = output.system || [];
          output.system.push(`[ENFORCEMENT BLOCKED] ${blocks[0].message}`);
          // Log the violation but don't crash — the write already happened
          // In a future iteration, we'd auto-revert the write
        }
        const warns = results.filter((r: EnforcementResult) => r.level === 'WARN');
        if (warns.length > 0) {
          output.system = output.system || [];
          for (const w of warns) {
            output.system.push(`[ENFORCEMENT] ${w.message}`);
          }
        }
      }

      // 1b. Todowrite tool → context focus update via fireContextUpdate
      if (enforcementBrain && toolName === 'todowrite') {
        const todos = toolArgs?.todos || [];
        if (Array.isArray(todos)) {
          for (const todo of todos) {
            const status = todo?.status || '';
            const content = todo?.content || '';
            if (!content) continue;
            if (status === 'completed' || status === 'cancelled') {
              enforcementBrain.fireContextUpdate('milestone', `Task ${status}: ${content}`);
            } else if (status === 'in_progress' || status === 'pending') {
              enforcementBrain.fireContextUpdate('milestone', `New task: ${content} [${status}]`);
            }
          }
        }
      }

      // 1c. Run Planning Brain (after execution — context updates + verification matrix)
      try {
        const planningBrain = getPlanningBrain();
        if (planningBrain) {
          const gateState = gateManager.getState() as { currentGate: string; currentIteration: string; verifyAttempts: number };
          const gateStr = gateState.currentGate || 'plan';
          const { driftWarning } = planningBrain.onAfterExecution(toolName, toolArgs, output, gateStr);
          if (driftWarning) {
            output.system = output.system || [];
            output.system.push(driftWarning);
          }
        }
      } catch {
        // Non-fatal — planning brain errors don't break tool execution
      }

      // ═══════════════════════════════════════════════════════════════
      // AUTONOMOUS CONTEXT DOC UPDATES — mechanical triggers, not model-driven
      // Runs on EVERY tool.execute.after. Silent on failure.
      // These are the CANONICAL location for context doc auto-updates.
      // ═══════════════════════════════════════════════════════════════
      try {
        const gateState = gateManager.getState() as { currentGate: string; currentIteration: string; verifyAttempts: number };
        const gateStr = gateState.currentGate || 'plan';

        // THOUGHT_STREAM.md — every tool call
        updateThoughtStream(`tool=${toolName} gate=${gateStr}`);

        // COMPACTION_SURVIVAL.md — current state
        updateCompactionSurvival(gateStr.toUpperCase(), 0, 0, `Tool: ${toolName}`);

        // POST-COMPACTION_PROMPT.md — resumption instructions
        updatePostCompactionPrompt(toolName, gateStr, 0, 0);

        // BUILD_STATE.md + DECISION_CHAIN.md — for todowrite events
        if (toolName === 'todowrite') {
          const todos = toolArgs?.todos || [];
          if (Array.isArray(todos)) {
            for (const todo of todos) {
              if (todo?.content && todo?.status) {
                updateBuildStateOnTaskComplete(todo.content, todo.status, todo.content);
                updateDecisionChain(todo.content, `Task ${todo.status}`, `gate=${gateStr}`);
              }
            }
          }
        }

        // EVIDENCE_STATE.md — for test/spawn events
        if (toolName === 'shark-test-runner' || toolName === 'shark-run-trident' || toolName === 'shark-spawn-container') {
          updateEvidenceState(0, `${toolName} completed at ${gateStr} gate`, 'pending verification');
        }
      } catch (ctxErr) {
        console.error(`[AutoCtx] Context doc update failed for ${toolName}: ${ctxErr instanceof Error ? ctxErr.message : String(ctxErr)}`);
      }

      // 2. Run existing tool summarizer + gate hook
      const summarizerHook = createToolSummarizerHook();
      if (summarizerHook) {
        await summarizerHook(input, output).catch(() => {});
      }
      const gateHookFn = createGateHook(gateManager, evidenceCollector, undefined);
      if (gateHookFn) {
        await gateHookFn(input, output).catch(() => {});
      }
    },

    'experimental.session.compacting': safeHook(createCompactingHook(gateManager), hookOptions),
    'experimental.chat.system.transform': createSystemTransformHook(gateManager, undefined),
  };
}