import type { ExecutionBrain } from './execution-brain.js';
import type { ReasoningBrain } from './reasoning-brain.js';
import type { SystemBrain } from './system-brain.js';
import type { BrainMessenger } from './brain-messenger.js';
import type { CodeContext } from '../../shared/injectables/index.js';

export interface BrainConcurrencyConfig {
  executionBrain: ExecutionBrain;
  reasoningBrain: ReasoningBrain;
  systemBrain: SystemBrain;
  messenger: BrainMessenger;
  executionPollMs?: number;
  reasoningPollMs?: number;
  systemPollMs?: number;
  basePath?: string;
}

export interface BrainConcurrencyManager {
  startAll(): void;
  stopAll(): void;
  getStatus(): {
    executionRunning: boolean;
    reasoningRunning: boolean;
    systemRunning: boolean;
    messagesProcessed: number;
    lastError: string | null;
  };
}

export function createBrainConcurrencyManager(config: BrainConcurrencyConfig): BrainConcurrencyManager {
  const {
    executionBrain,
    reasoningBrain,
    systemBrain,
    messenger,
    executionPollMs = 200,
    reasoningPollMs = 200,
    systemPollMs = 500,
    basePath = '',
  } = config;

  let executionInterval: ReturnType<typeof setInterval> | null = null;
  let reasoningInterval: ReturnType<typeof setInterval> | null = null;
  let systemInterval: ReturnType<typeof setInterval> | null = null;
  let messagesProcessed = 0;
  let lastError: string | null = null;

  function runExecutionLoop(): void {
    try {
      const messages = messenger.receive('shark-execution');
      for (const msg of messages) {
        messagesProcessed++;
        if (msg.type === 'derailment') {
          const state = executionBrain.getState();
          if (state) {
            const existing = state.state.blocks ?? [];
            executionBrain.updateState({
              blocks: [...existing, `derailment: ${msg.payload?.detection ?? 'unknown'}`],
            });
          }
        }
        if (msg.type === 'context-inject') {
          const context = msg.payload?.thinkingState;
          if (context && typeof context === 'object') {
            const state = executionBrain.getState();
            if (state) {
              executionBrain.updateState({
                context: {
                  ...state.state.context,
                  buildOutput: state.state.context.buildOutput || JSON.stringify(context),
                },
              });
            }
          }
        }
        if (msg.type === 'gate-failure') {
          executionBrain.reportRuntimeViolation(
            `Gate failure: ${msg.payload?.issue ?? 'unknown'}`
          );
        }
      }

      const state = executionBrain.getState();
      if (state) {
        const violations = state.state.context?.runtimeViolations ?? [];
        if (violations.length > 3) {
          lastError = `Execution brain has ${violations.length} runtime violations`;
        }

        if (state.state.context?.buildOutput && typeof state.state.context.buildOutput === 'string') {
          const scanContext: CodeContext = {
            filePath: basePath,
            toolName: 'execution-loop',
            gate: state.gate,
            surroundingCode: '',
          };
          const scanViolations = executionBrain.autoScanGeneratedCode(
            state.state.context.buildOutput,
            scanContext,
          );
          if (scanViolations.length > 0) {
            void scanViolations;
          }
        }
      }
    } catch (err) {
      lastError = `Execution loop error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  function runReasoningLoop(): void {
    try {
      const messages = messenger.receive('shark-reasoning');
      for (const msg of messages) {
        messagesProcessed++;
      }

      const executionState = reasoningBrain.readExecutionState();
      const thinkingState = reasoningBrain.getState();

      if (executionState && thinkingState) {
        const currentTask = (executionState.state as Record<string, unknown>)?.currentTask;
        if (typeof currentTask === 'string' && currentTask.length > 0) {
          const currentMonitoring = thinkingState.state.currentMonitoring ?? [];
          if (!currentMonitoring.includes(currentTask)) {
            reasoningBrain.updateState({
              currentMonitoring: [...currentMonitoring, currentTask],
            });
          }
        }
      }
    } catch (err) {
      lastError = `Reasoning loop error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  function runSystemLoop(): void {
    try {
      const messages = messenger.receive('shark-system');
      for (const msg of messages) {
        messagesProcessed++;
        if (msg.type === 'checkpoint') {
          const phase = msg.payload?.phase;
          const completedFiles = msg.payload?.completedFiles;
          if (typeof phase === 'string' && typeof completedFiles === 'number') {
            const state = systemBrain.getState();
            if (state) {
              systemBrain.updateState({
                lastEvaluation: `checkpoint: phase=${phase}, files=${completedFiles}`,
              });
            }
          }
        }
        if (msg.type === 'gate-failure') {
          systemBrain.escalate(
            `Gate failure escalated: ${msg.payload?.issue ?? 'unknown'}`,
            (msg.payload?.severity as 'critical' | 'high' | 'medium' | 'low') ?? 'high'
          );
        }
      }

      const systemState = systemBrain.getState();
      const activeDerailments = systemState?.state.activeDerailments ?? [];
      if (activeDerailments.length > 0) {
        const unresolvedViolations = systemBrain.getUnresolvedViolations();
        if (unresolvedViolations.length > 5) {
          lastError = `System brain: ${unresolvedViolations.length} unresolved runtime violations, ${activeDerailments.length} active derailments`;
        }
      }

      const executionState = executionBrain.getState();
      if (executionState?.state.context?.buildOutput && typeof executionState.state.context.buildOutput === 'string') {
        const enforcementContext: CodeContext = {
          filePath: basePath,
          toolName: 'system-loop',
          gate: executionState.gate,
          surroundingCode: '',
        };

        const auditResult = systemBrain.selfAudit(executionState.state.context.buildOutput, enforcementContext);
        if (!auditResult.passed) {
          const criticalCount = auditResult.violations.filter(v => v.detector.severity === 'critical').length;
          if (criticalCount > 0) {
            messenger.send({
              from: 'shark-system',
              to: 'shark-execution',
              type: 'gate-failure',
              priority: 'critical',
              payload: {
                issue: `Self-audit failed: ${criticalCount} critical violations in build output`,
                severity: 'critical',
              },
              requiresAck: true,
            });
          }
        }

        systemBrain.enforceArchitecture(executionState.state.context.buildOutput, enforcementContext);
      }
    } catch (err) {
      lastError = `System loop error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return {
    startAll(): void {
      if (executionInterval !== null) {
        clearInterval(executionInterval);
      }
      if (reasoningInterval !== null) {
        clearInterval(reasoningInterval);
      }
      if (systemInterval !== null) {
        clearInterval(systemInterval);
      }

      executionInterval = setInterval(runExecutionLoop, executionPollMs);
      reasoningInterval = setInterval(runReasoningLoop, reasoningPollMs);
      systemInterval = setInterval(runSystemLoop, systemPollMs);
    },

    stopAll(): void {
      if (executionInterval !== null) {
        clearInterval(executionInterval);
        executionInterval = null;
      }
      if (reasoningInterval !== null) {
        clearInterval(reasoningInterval);
        reasoningInterval = null;
      }
      if (systemInterval !== null) {
        clearInterval(systemInterval);
        systemInterval = null;
      }
    },

    getStatus(): {
      executionRunning: boolean;
      reasoningRunning: boolean;
      systemRunning: boolean;
      messagesProcessed: number;
      lastError: string | null;
    } {
      return {
        executionRunning: executionInterval !== null,
        reasoningRunning: reasoningInterval !== null,
        systemRunning: systemInterval !== null,
        messagesProcessed,
        lastError,
      };
    },
  };
}
