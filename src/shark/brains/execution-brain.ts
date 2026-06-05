import type { BrainState, StateStore } from './brain-state-store.js';
import type { BrainMessenger } from './brain-messenger.js';
import type { DomainName } from './domain-ownership.js';
import { detectAllViolations, detectAllT1Violations, evaluateCodeAgainstChecklist, type CodeContext, type EnforcementRule } from '../../shared/injectables/index.js';

export interface ExecutionBrainConfig {
  stateStore: StateStore;
  messenger: BrainMessenger;
  basePath: string;
}

export interface EngineeringChecklist {
  returnTypeCorrect: boolean;
  nullSafetyHandled: boolean;
  errorPathsComplete: boolean;
  resourceCleanupAllPaths: boolean;
  concurrentSafety: boolean;
  importValidity: boolean;
  pathResolution: boolean;
  configValidated: boolean;
  typeAssertionsGuarded: boolean;
  asyncDiscipline: boolean;
  crossSystemDataContractsValidated: boolean;
  coupledDataConsistencyVerified: boolean;
  gridDataIntegrityVerified: boolean;
}

export interface ExecutionBrainState extends BrainState {
  brain: 'shark-execution';
  state: {
    currentTask: string;
    progress: string;
    blocks: string[];
    engineeringChecklist: EngineeringChecklist;
    context: {
      planArtifacts: string[];
      buildOutput: string;
      testArtifacts: string[];
      runtimeViolations: string[];
    };
  };
}

const DEFAULT_CHECKLIST: EngineeringChecklist = {
  returnTypeCorrect: false,
  nullSafetyHandled: false,
  errorPathsComplete: false,
  resourceCleanupAllPaths: false,
  concurrentSafety: false,
  importValidity: false,
  pathResolution: false,
  configValidated: false,
  typeAssertionsGuarded: false,
  asyncDiscipline: false,
  crossSystemDataContractsValidated: false,
  coupledDataConsistencyVerified: false,
  gridDataIntegrityVerified: false,
};

export function createExecutionBrain(config: ExecutionBrainConfig) {
  const { stateStore, messenger, basePath } = config;

  function getState(): ExecutionBrainState | null {
    const state = stateStore.read('execution-state', 'shark-execution');
    return state as ExecutionBrainState | null;
  }

  function updateState(updates: Partial<ExecutionBrainState['state']>): void {
    const current = getState();
    const next: ExecutionBrainState = {
      brain: 'shark-execution',
      timestamp: new Date().toISOString(),
      gate: current?.gate || 'PLAN',
      iteration: current?.iteration || 'V1.0',
      state: {
        currentTask: updates.currentTask ?? current?.state.currentTask ?? '',
        progress: updates.progress ?? current?.state.progress ?? '0%',
        blocks: updates.blocks ?? current?.state.blocks ?? [],
        engineeringChecklist: updates.engineeringChecklist ?? current?.state.engineeringChecklist ?? { ...DEFAULT_CHECKLIST },
        context: {
          planArtifacts: updates.context?.planArtifacts ?? current?.state.context?.planArtifacts ?? [],
          buildOutput: updates.context?.buildOutput ?? current?.state.context?.buildOutput ?? '',
          testArtifacts: updates.context?.testArtifacts ?? current?.state.context?.testArtifacts ?? [],
          runtimeViolations: updates.context?.runtimeViolations ?? current?.state.context?.runtimeViolations ?? [],
        },
      },
      evidence: current?.evidence,
    };
    stateStore.write('execution-state', 'shark-execution', next);
  }

  function autoScanGeneratedCode(code: string, context: CodeContext): EnforcementRule[] {
    try {
      const violations = detectAllViolations(code, context);
      for (const v of violations) {
        reportRuntimeViolation(`[${v.detector.id}] ${v.detector.description} (${v.detector.severity})`);
      }
      return violations;
    } catch {
      return [];
    }
  }

  function blockTheatricalCode(code: string, context: CodeContext): { blocked: boolean; violations: EnforcementRule[] } {
    try {
      const allViolations: EnforcementRule[] = [];
      const t1Violations = detectAllT1Violations(code, context);
      allViolations.push(...t1Violations);

      const criticalOrHigh = allViolations.filter(
        v => v.detector.severity === 'critical' || v.detector.severity === 'high'
      );

      return {
        blocked: criticalOrHigh.length > 0,
        violations: allViolations,
      };
    } catch {
      return { blocked: false, violations: [] };
    }
  }

  function autoEvaluateChecklist(code: string, context: CodeContext): Partial<EngineeringChecklist> {
    try {
      const evaluated = evaluateCodeAgainstChecklist(code, context);
      const merged: EngineeringChecklist = { ...DEFAULT_CHECKLIST, ...evaluated as Partial<EngineeringChecklist> };
      updateState({ engineeringChecklist: merged });
      return evaluated;
    } catch {
      return {};
    }
  }

  function validateEngineeringChecklist(checklist: Partial<EngineeringChecklist>, code?: string, context?: CodeContext): { passed: boolean; violations: string[] } {
    let merged: EngineeringChecklist;

    if (code && context) {
      try {
        const autoResult = evaluateCodeAgainstChecklist(code, context);
        merged = { ...DEFAULT_CHECKLIST, ...checklist, ...autoResult as Partial<EngineeringChecklist> };
      } catch {
        merged = { ...DEFAULT_CHECKLIST, ...checklist };
      }
    } else {
      merged = { ...DEFAULT_CHECKLIST, ...checklist };
    }

    const violations: string[] = [];

    if (!merged.returnTypeCorrect) violations.push('Return type not verified in all paths');
    if (!merged.nullSafetyHandled) violations.push('Null/undefined input not handled');
    if (!merged.errorPathsComplete) violations.push('Error paths incomplete — catch {} without handling');
    if (!merged.resourceCleanupAllPaths) violations.push('Resource cleanup missing in error paths');
    if (!merged.concurrentSafety) violations.push('Concurrent call safety not verified');
    if (!merged.importValidity) violations.push('Import validity not verified');
    if (!merged.pathResolution) violations.push('Path resolution may fail in different environments');
    if (!merged.configValidated) violations.push('Configuration values not validated');
    if (!merged.typeAssertionsGuarded) violations.push('Type assertions (as) not guarded by runtime checks');
    if (!merged.asyncDiscipline) violations.push('Async operations missing error handling');
    if (!merged.crossSystemDataContractsValidated) violations.push('Cross-system data contracts not validated — data shape at integration boundaries not verified');
    if (!merged.coupledDataConsistencyVerified) violations.push('Coupled data consistency not verified — cross-referenced values may be inconsistent');
    if (!merged.gridDataIntegrityVerified) violations.push('Grid/map data integrity not verified — ragged rows, missing tiles, or invalid warp targets');

    return { passed: violations.length === 0, violations };
  }

  function checkPoint(phase: string, completedFiles: number): void {
    updateState({ progress: `${completedFiles} files completed` });
    messenger.send({
      from: 'shark-execution',
      to: 'shark-system',
      type: 'checkpoint',
      priority: 'normal',
      payload: { phase, completedFiles },
      requiresAck: false,
    });

    const state = getState();
    if (state?.state.context?.buildOutput && typeof state.state.context.buildOutput === 'string') {
      autoScanGeneratedCode(state.state.context.buildOutput, {
        filePath: basePath,
        toolName: 'checkpoint',
        gate: state.gate,
        surroundingCode: '',
      });
    }
  }

  function reportRuntimeViolation(violation: string): void {
    const current = getState();
    const existing = current?.state.context?.runtimeViolations ?? [];
    updateState({
      context: {
        ...current?.state.context ?? { planArtifacts: [], buildOutput: '', testArtifacts: [], runtimeViolations: [] },
        runtimeViolations: [...existing, violation],
      },
    });
    messenger.send({
      from: 'shark-execution',
      to: 'shark-system',
      type: 'derailment',
      priority: 'high',
      payload: { detection: `RUNTIME VIOLATION: ${violation}`, severity: 'high' },
      requiresAck: true,
    });
  }

  function readPlanState(): BrainState | null {
    return stateStore.read('plan-state', 'shark-execution');
  }

  function readThinkingState(): BrainState | null {
    return stateStore.read('thinking-state', 'shark-execution');
  }

  function setGate(gate: string): void {
    const current = getState();
    if (current) {
      stateStore.write('execution-state', 'shark-execution', {
        ...current,
        gate,
        timestamp: new Date().toISOString(),
      });
    }
  }

  function setIteration(iteration: string): void {
    const current = getState();
    if (current) {
      stateStore.write('execution-state', 'shark-execution', {
        ...current,
        iteration,
        timestamp: new Date().toISOString(),
      });
    }
  }

  return {
    getState,
    updateState,
    checkPoint,
    readPlanState,
    readThinkingState,
    setGate,
    setIteration,
    validateEngineeringChecklist,
    reportRuntimeViolation,
    autoScanGeneratedCode,
    blockTheatricalCode,
    autoEvaluateChecklist,
  };
}

export type ExecutionBrain = ReturnType<typeof createExecutionBrain>;
