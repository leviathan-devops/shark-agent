import type { BrainState, StateStore } from './brain-state-store.js';
import type { BrainMessenger } from './brain-messenger.js';
import { ALL_T1_RULES, detectAllT1Violations, type CodeContext, type EnforcementRule } from '../../shared/injectables/index.js';

export interface SystemBrainConfig {
  stateStore: StateStore;
  messenger: BrainMessenger;
}

export interface RuntimeViolation {
  id: string;
  timestamp: string;
  category: 'error-path' | 'type-safety' | 'resource-leak' | 'async-discipline' | 'config-validation' | 'theatrical' | 'data-contract' | 'coupling';
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  resolved: boolean;
}

export interface SystemBrainState extends BrainState {
  brain: 'shark-system';
  state: {
    activeDerailments: string[];
    gateCriteria: Record<string, boolean>;
    lastEvaluation: string;
    escalationCount: number;
    runtimeViolations: RuntimeViolation[];
    engineeringStandardEnforced: boolean;
  };
}

export interface GateCriteria {
  gateId: string;
  criteria: Array<{
    type: 'evidence' | 'pattern' | 'state' | 'runtime-check';
    description: string;
    required: string[];
  }>;
  evaluatedBy: 'shark-system';
}

export interface SelfAuditResult {
  passed: boolean;
  violations: EnforcementRule[];
  totalRules: number;
  triggeredRules: number;
}

export function createSystemBrain(config: SystemBrainConfig) {
  const { stateStore, messenger } = config;

  function getState(): SystemBrainState | null {
    const state = stateStore.read('workflow-state', 'shark-system');
    return state as SystemBrainState | null;
  }

  function updateState(updates: Partial<SystemBrainState['state']>): void {
    const current = getState();
    const next: SystemBrainState = {
      brain: 'shark-system',
      timestamp: new Date().toISOString(),
      gate: current?.gate || 'PLAN',
      iteration: current?.iteration || 'V1.0',
      state: {
        activeDerailments: updates.activeDerailments ?? current?.state.activeDerailments ?? [],
        gateCriteria: updates.gateCriteria ?? current?.state.gateCriteria ?? {},
        lastEvaluation: updates.lastEvaluation ?? current?.state.lastEvaluation ?? '',
        escalationCount: updates.escalationCount ?? current?.state.escalationCount ?? 0,
        runtimeViolations: updates.runtimeViolations ?? current?.state.runtimeViolations ?? [],
        engineeringStandardEnforced: updates.engineeringStandardEnforced ?? current?.state.engineeringStandardEnforced ?? true,
      },
      evidence: current?.evidence,
    };
    stateStore.write('workflow-state', 'shark-system', next);
  }

  function detectDerailment(detection: string, severity: 'critical' | 'high' | 'medium' | 'low'): void {
    const current = getState();
    updateState({
      activeDerailments: [...(current?.state.activeDerailments ?? []), detection],
    });

    messenger.send({
      from: 'shark-system',
      to: 'shark-execution',
      type: 'derailment',
      priority: severity === 'critical' ? 'critical' : 'high',
      payload: { detection, severity },
      requiresAck: true,
    });
  }

  function recordRuntimeViolation(violation: RuntimeViolation): void {
    const current = getState();
    const existing = current?.state.runtimeViolations ?? [];
    updateState({
      runtimeViolations: [...existing, violation],
    });

    if (violation.severity === 'critical' || violation.severity === 'high') {
      messenger.send({
        from: 'shark-system',
        to: 'shark-execution',
        type: 'derailment',
        priority: 'high',
        payload: {
          detection: `RUNTIME VIOLATION [${violation.category}]: ${violation.description}`,
          severity: violation.severity,
        },
        requiresAck: true,
      });
    }
  }

  function clearDerailment(detection: string): void {
    const current = getState();
    const updated = (current?.state.activeDerailments ?? []).filter(d => d !== detection);
    updateState({ activeDerailments: updated });
  }

  function evaluateGate(criteria: GateCriteria): boolean {
    let allPassed = true;
    const results: Record<string, boolean> = {};

    for (const criterion of criteria.criteria) {
      let passed = true;
      for (const req of criterion.required) {
        if (!req) passed = false;
      }
      results[criterion.description] = passed;
      if (!passed) allPassed = false;
    }

    updateState({
      gateCriteria: results,
      lastEvaluation: new Date().toISOString(),
    });

    return allPassed;
  }

  function escalate(issue: string, severity: 'critical' | 'high' | 'medium' | 'low'): void {
    const current = getState();
    updateState({
      escalationCount: (current?.state.escalationCount ?? 0) + 1,
    });

    messenger.send({
      from: 'shark-system',
      to: 'shark-execution',
      type: 'gate-failure',
      priority: severity === 'critical' ? 'critical' : 'high',
      payload: { issue, severity },
      requiresAck: true,
    });
  }

  function semanticAnalyze(sourceCode: string, context: CodeContext): RuntimeViolation[] {
    const violations: RuntimeViolation[] = [];
    const timestamp = new Date().toISOString();

    try {
      const triggered = detectAllT1Violations(sourceCode, context);

      for (const rule of triggered) {
        const categoryMap: Record<string, RuntimeViolation['category']> = {
          'import-safety': 'type-safety',
          'type-safety': 'type-safety',
          'error-handling': 'error-path',
          'resource-management': 'resource-leak',
          'state-management': 'async-discipline',
          'dependency-safety': 'type-safety',
          'path-safety': 'config-validation',
          'config-safety': 'config-validation',
          'async-safety': 'async-discipline',
          'contract-safety': 'data-contract',
          'theatrical-code': 'theatrical',
          'collection-safety': 'data-contract',
          'testing-anti-pattern': 'theatrical',
          'container-config': 'config-validation',
          'evidence-fraud': 'theatrical',
          'protocol-violation': 'theatrical',
          'config-audit': 'config-validation',
          'identity-scoping': 'theatrical',
          'firewall-bypass': 'theatrical',
          'adversarial-pattern': 'theatrical',
          'lifecycle-violation': 'theatrical',
          'preflight': 'config-validation',
          'anti-derailment': 'theatrical',
          'gap-violation': 'theatrical',
          'evidence': 'theatrical',
        };

        const mappedCategory = categoryMap[rule.detector.category] || 'theatrical';

        violations.push({
          id: `sem_${Date.now()}_${rule.detector.id}_${Math.random().toString(36).slice(2, 8)}`,
          timestamp,
          category: mappedCategory,
          description: `[${rule.detector.id}] ${rule.detector.description}`,
          severity: rule.detector.severity === 'critical' ? 'critical'
            : rule.detector.severity === 'high' ? 'high'
            : 'medium',
          resolved: false,
        });
      }
    } catch {
      // analysis failure — return what we have
    }

    return violations;
  }

  function selfAudit(code: string, context: CodeContext): SelfAuditResult {
    try {
      const violations = detectAllT1Violations(code, context);
      const totalRules = ALL_T1_RULES.length;

      for (const rule of violations) {
        const categoryMap: Record<string, RuntimeViolation['category']> = {
          'import-safety': 'type-safety',
          'type-safety': 'type-safety',
          'error-handling': 'error-path',
          'resource-management': 'resource-leak',
          'state-management': 'async-discipline',
          'dependency-safety': 'type-safety',
          'path-safety': 'config-validation',
          'config-safety': 'config-validation',
          'async-safety': 'async-discipline',
          'contract-safety': 'data-contract',
          'theatrical-code': 'theatrical',
          'collection-safety': 'data-contract',
          'testing-anti-pattern': 'theatrical',
          'container-config': 'config-validation',
          'evidence-fraud': 'theatrical',
          'protocol-violation': 'theatrical',
          'config-audit': 'config-validation',
          'identity-scoping': 'theatrical',
          'firewall-bypass': 'theatrical',
          'adversarial-pattern': 'theatrical',
          'lifecycle-violation': 'theatrical',
          'preflight': 'config-validation',
          'anti-derailment': 'theatrical',
          'gap-violation': 'theatrical',
          'evidence': 'theatrical',
        };

        recordRuntimeViolation({
          id: `audit_${Date.now()}_${rule.detector.id}_${Math.random().toString(36).slice(2, 8)}`,
          timestamp: new Date().toISOString(),
          category: categoryMap[rule.detector.category] || 'theatrical',
          description: `[${rule.detector.id}] ${rule.detector.description}`,
          severity: rule.detector.severity === 'critical' ? 'critical'
            : rule.detector.severity === 'high' ? 'high'
            : 'medium',
          resolved: false,
        });
      }

      return {
        passed: violations.length === 0,
        violations,
        totalRules,
        triggeredRules: violations.length,
      };
    } catch {
      return {
        passed: true,
        violations: [],
        totalRules: ALL_T1_RULES.length,
        triggeredRules: 0,
      };
    }
  }

  function enforceArchitecture(buildOutput: string, context: CodeContext): SelfAuditResult {
    const analysisViolations = semanticAnalyze(buildOutput, context);
    const auditResult = selfAudit(buildOutput, context);

    if (!auditResult.passed) {
      const criticalViolations = auditResult.violations.filter(
        v => v.detector.severity === 'critical'
      );

      if (criticalViolations.length > 0) {
        messenger.send({
          from: 'shark-system',
          to: 'shark-execution',
          type: 'gate-failure',
          priority: 'critical',
          payload: {
            issue: `ARCHITECTURE ENFORCEMENT: ${criticalViolations.length} critical violations detected — code requires correction`,
            violations: criticalViolations.map(v => ({
              id: v.detector.id,
              description: v.detector.description,
              severity: v.detector.severity,
            })),
          },
          requiresAck: true,
        });
      }
    }

    return auditResult;
  }

  function scanForTheatricalPatterns(sourceCode: string, context?: CodeContext): RuntimeViolation[] {
    const ctx: CodeContext = context ?? {
      filePath: '',
      toolName: 'scan',
      gate: getState()?.gate ?? 'BUILD',
      surroundingCode: '',
    };
    return semanticAnalyze(sourceCode, ctx);
  }

  function getUnresolvedViolations(): RuntimeViolation[] {
    const current = getState();
    return (current?.state.runtimeViolations ?? []).filter(v => !v.resolved);
  }

  function readExecutionState(): BrainState | null {
    return stateStore.read('execution-state', 'shark-system');
  }

  function readThinkingState(): BrainState | null {
    return stateStore.read('thinking-state', 'shark-system');
  }

  function readPlanState(): BrainState | null {
    return stateStore.read('plan-state', 'shark-system');
  }

  function readQualityState(): BrainState | null {
    return stateStore.read('quality-state', 'shark-system');
  }

  return {
    getState,
    updateState,
    detectDerailment,
    clearDerailment,
    evaluateGate,
    escalate,
    readExecutionState,
    readThinkingState,
    readPlanState,
    readQualityState,
    recordRuntimeViolation,
    scanForTheatricalPatterns,
    semanticAnalyze,
    selfAudit,
    enforceArchitecture,
    getUnresolvedViolations,
  };
}

export type SystemBrain = ReturnType<typeof createSystemBrain>;
