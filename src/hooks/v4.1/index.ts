import * as fs from 'node:fs';
import * as path from 'node:path';
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
import { createWriteTimeGate } from './write-time-gate.js';
import { createPostWriteAudit } from './post-write-audit.js';
import { SemanticFirewall } from '../../semantic-firewall/semantic-firewall.js';
import { ExecutionContext } from '../../semantic-firewall/execution-context.js';
import { getCurrentAgent } from './agent-state.js';
import { isSharkAgent } from '../../shared/agent-identity.js';
import {
  updateThoughtStream, updateCompactionSurvival, updatePostCompactionPrompt,
  updateBuildStateOnTaskComplete, updateEvidenceState, updateDecisionChain, updateTaskQueue
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
  enforcementBrain?: EnforcementBrain,
  semanticFirewall?: SemanticFirewall,
  executionContext?: ExecutionContext
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

  const writeTimeHandler = semanticFirewall && executionContext
    ? createWriteTimeGate(semanticFirewall, executionContext)
    : null;
  const postWriteHandler = semanticFirewall
    ? createPostWriteAudit(semanticFirewall, path.join(process.cwd(), '.shark'))
    : null;

  return {
    'event': createSessionHook(gateManager, evidenceCollector, undefined, stateStore, messenger, concurrencyManager),
    'chat.message': createChatMessageHook(),
    'command.execute.before': safeHook(createCommandExecuteHook(), hookOptions),
    'experimental.chat.messages.transform': safeHook(createMessagesTransformHook(), hookOptions),

    /* tool.execute.before: Frontal Lobe + Guardian */
    'tool.execute.before': async (input: Record<string, unknown>, output: Record<string, unknown>) => {
      const currentAgent = getCurrentAgent(input.sessionID as string | undefined) || (input.agent as string | undefined) || '';
      if (typeof currentAgent === 'string' && currentAgent !== '' && !isSharkAgent(currentAgent)) return;

      if (executionContext && typeof currentAgent === 'string' && currentAgent !== '') {
        executionContext.setAgent(currentAgent);
      }

      try {
        if (enforcementBrain) {
          const toolName = (input.tool as string) || '';
          const toolArgs = (input.args ?? output.args ?? {}) as Record<string, unknown>;
          const thoughtStream = (input.thoughtStream ?? output.thoughtStream ?? '') as string;
          const results = enforcementBrain.evaluateBefore(toolName, toolArgs, thoughtStream);
          const blocks = results.filter((r: EnforcementResult) => r.level === 'BLOCK');
          if (blocks.length > 0) throw new StructuredBlockError(blocks[0]);
          const warns = results.filter((r: EnforcementResult) => r.level === 'WARN');
          if (warns.length > 0) {
            output.system = (output.system as string[] | undefined) || [];
            (output.system as string[]).push(`[ENFORCEMENT] ${warns[0].message}`);
          }
        }
        if (writeTimeHandler) {
          await writeTimeHandler(input, output);
        }
        const guardianHandler = createGuardianHook(guardian, gateManager);
        if (guardianHandler) await guardianHandler(input, output);
      } catch (err) {
        try {
          const { updateDebugLog, updateSoCPreservation } = await import('../../shared/context-manager.js');
          const toolName = (input.tool as string) || '';
          const errMsg = err instanceof Error ? err.message : String(err);
          updateDebugLog('enforcement-block', `Blocked: ${toolName}`, errMsg, `Layer: guardian-hook`, `Enforcement block: ${toolName} - ${errMsg}`);
          updateSoCPreservation([{ pattern: `Enforcement block: ${toolName}`, context: errMsg, source: 'guardian-hook' }]);
        } catch (logErr) {
          console.error(`[EnforcementCatch] Failed to log: ${logErr instanceof Error ? logErr.message : String(logErr)}`);
        }
        throw err;
      }
    },

    /* tool.execute.after: RGE + SRE + context doc updates */
    'tool.execute.after': async (input: Record<string, unknown>, output: Record<string, unknown>) => {
      const afterAgent = getCurrentAgent(input.sessionID as string | undefined) || (input.agent as string | undefined) || '';
      if (typeof afterAgent === 'string' && afterAgent !== '' && !isSharkAgent(afterAgent)) return;

      const toolName = (input.tool as string) || '';
      const toolArgs = (input.args ?? output.args ?? {}) as Record<string, unknown>;

      if (enforcementBrain) {
        const results = await enforcementBrain.evaluateAfter(toolName, toolArgs, output);
        const blocks = results.filter((r: EnforcementResult) => r.level === 'BLOCK');
        if (blocks.length > 0) {
          output.system = (output.system as string[] | undefined) || [];
          (output.system as string[]).push(`[ENFORCEMENT BLOCKED] ${blocks[0].message}`);
        }
        const warns = results.filter((r: EnforcementResult) => r.level === 'WARN');
        if (warns.length > 0) {
          output.system = (output.system as string[] | undefined) || [];
          for (const w of warns) (output.system as string[]).push(`[ENFORCEMENT] ${w.message}`);
        }
      }

      if (postWriteHandler) {
        try {
          await postWriteHandler(input, output);
        } catch (e) {
          console.warn('[PostWriteAudit] handler failed:', e instanceof Error ? e.message : String(e));
        }
      }

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

      // Context doc updates
      try {
        const gateState = gateManager.getState() as { currentGate: string };
        const gateStr = gateState.currentGate || 'plan';
        updateThoughtStream(`tool=${toolName} gate=${gateStr}`);
        updateCompactionSurvival(gateStr.toUpperCase(), 0, 0, `Tool: ${toolName}`);
        updatePostCompactionPrompt(toolName, gateStr, 0, 0);

        if (toolName === 'todowrite') {
          const todos = toolArgs?.todos || [];
          if (Array.isArray(todos)) {
            for (const todo of todos) {
              if (todo?.content && todo?.status) {
                updateBuildStateOnTaskComplete(todo.content, todo.status, todo.content);
                updateTaskQueue(todo.content, todo.content, todo.status === 'completed' ? 'COMPLETE' : todo.status === 'in_progress' ? 'PENDING' : 'COMPLETE', todo.content);
                updateDecisionChain(todo.content, `Task ${todo.status}`, `gate=${gateStr}`);
              }
            }
          }
        }

        if (toolName === 'shark-test-runner' || toolName === 'shark-run-trident' || toolName === 'shark-spawn-container') {
          updateEvidenceState(0, `${toolName} completed at ${gateStr} gate`, 'pending verification');
        }
      } catch (ctxErr) {
        console.error(`[AutoCtx] Context doc update failed: ${ctxErr instanceof Error ? ctxErr.message : String(ctxErr)}`);
      }

      const summarizerHook = createToolSummarizerHook();
      if (summarizerHook) await summarizerHook(input, output).catch(() => {});
      const gateHookFn = createGateHook(gateManager, evidenceCollector, undefined, executionContext);
      if (gateHookFn) await gateHookFn(input, output).catch(() => {});
    },

    'experimental.session.compacting': safeHook(createCompactingHook(gateManager), hookOptions),
    'experimental.chat.system.transform': createSystemTransformHook(gateManager, undefined),
  };
}
