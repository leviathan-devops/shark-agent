import type { BrainState, StateStore } from './brain-state-store.js';
import type { BrainMessenger } from './brain-messenger.js';
import { ALL_T1_RULES, detectAllT1Violations, type CodeContext, type EnforcementRule } from '../../shared/injectables/index.js';

export interface ReasoningBrainConfig {
  stateStore: StateStore;
  messenger: BrainMessenger;
}

export interface RuntimePattern {
  id: string;
  category: 'error-handling' | 'resource-cleanup' | 'type-safety' | 'async' | 'config' | 'spec-fidelity' | 'data-contract' | 'coupling';
  pattern: string;
  correction: string;
  applicableGates: string[];
}

export interface ReasoningBrainState extends BrainState {
  brain: 'shark-reasoning';
  state: {
    currentMonitoring: string[];
    contextGaps: string[];
    autoDebugHits: number;
    injectedContexts: string[];
    detectedPatterns: RuntimePattern[];
    specViolations: string[];
  };
}

let cachedT1Rules: EnforcementRule[] | null = null;

export function getT1Rules(): EnforcementRule[] {
  if (cachedT1Rules === null) {
    cachedT1Rules = [...ALL_T1_RULES];
  }
  return cachedT1Rules;
}

const RUNTIME_PATTERNS: RuntimePattern[] = [
  {
    id: 'rp-001',
    category: 'error-handling',
    pattern: 'catch {}',
    correction: 'Every catch block must handle the error: log, recover, or propagate. Silent catch is a defect.',
    applicableGates: ['BUILD', 'TEST'],
  },
  {
    id: 'rp-002',
    category: 'type-safety',
    pattern: 'as SomeType',
    correction: 'Type assertions must be guarded by runtime validation: typeof, instanceof, Array.isArray.',
    applicableGates: ['BUILD'],
  },
  {
    id: 'rp-003',
    category: 'resource-cleanup',
    pattern: 'setInterval without clearInterval',
    correction: 'Resources must be cleaned up in ALL code paths. Use try/finally for cleanup.',
    applicableGates: ['BUILD', 'VERIFY'],
  },
  {
    id: 'rp-004',
    category: 'async',
    pattern: 'floating Promise',
    correction: 'Every Promise must have .catch() or be awaited in try/catch. No fire-and-forget.',
    applicableGates: ['BUILD'],
  },
  {
    id: 'rp-005',
    category: 'config',
    pattern: 'unvalidated config',
    correction: 'All configuration values must be validated before use: type check, range check, required check.',
    applicableGates: ['BUILD', 'TEST'],
  },
  {
    id: 'rp-006',
    category: 'spec-fidelity',
    pattern: 'partial implementation',
    correction: 'Build must match spec EXACTLY. Nothing clipped, truncated, or simplified. Full spec = full implementation.',
    applicableGates: ['BUILD', 'TEST', 'VERIFY'],
  },
  {
    id: 'rp-007',
    category: 'spec-fidelity',
    pattern: 'cross-system data contract mismatch',
    correction: 'When System A produces data consumed by System B, the data SHAPE must match at the integration boundary. Array of strings vs array of arrays, object key names, nesting depth — all must be verified. The #1 source of "compiles but crashes at runtime" defects. Before writing any consumer function, trace what the producer actually outputs.',
    applicableGates: ['BUILD', 'TEST', 'VERIFY'],
  },
  {
    id: 'rp-008',
    category: 'config',
    pattern: 'coupled data inconsistency',
    correction: 'When two values reference each other across different code locations (map tiles vs warp coordinates, config keys vs lookup table keys), they MUST be consistent. Map says y=6 but logic checks y=5 is a coupling defect. Extract to shared constants or add init-time assertions. Search for hardcoded coordinates/indices/keys that reference data defined elsewhere.',
    applicableGates: ['BUILD', 'TEST', 'VERIFY'],
  },
  {
    id: 'rp-009',
    category: 'spec-fidelity',
    pattern: 'ragged grid data',
    correction: 'All 2D grid/map data must have consistent row widths. parseMap or similar functions that assume uniform row width will produce data corruption when rows differ. Validate grid dimensions at construction time. Pad short rows or reject the data.',
    applicableGates: ['BUILD', 'TEST'],
  },
];

export function createReasoningBrain(config: ReasoningBrainConfig) {
  const { stateStore, messenger } = config;

  function getState(): ReasoningBrainState | null {
    const state = stateStore.read('thinking-state', 'shark-reasoning');
    return state as ReasoningBrainState | null;
  }

  function updateState(updates: Partial<ReasoningBrainState['state']>): void {
    const current = getState();
    const next: ReasoningBrainState = {
      brain: 'shark-reasoning',
      timestamp: new Date().toISOString(),
      gate: current?.gate || 'PLAN',
      iteration: current?.iteration || 'V1.0',
      state: {
        currentMonitoring: updates.currentMonitoring ?? current?.state.currentMonitoring ?? [],
        contextGaps: updates.contextGaps ?? current?.state.contextGaps ?? [],
        autoDebugHits: updates.autoDebugHits ?? current?.state.autoDebugHits ?? 0,
        injectedContexts: updates.injectedContexts ?? current?.state.injectedContexts ?? [],
        detectedPatterns: updates.detectedPatterns ?? current?.state.detectedPatterns ?? [],
        specViolations: updates.specViolations ?? current?.state.specViolations ?? [],
      },
      evidence: current?.evidence,
    };
    stateStore.write('thinking-state', 'shark-reasoning', next);
  }

  function injectContext(targetBrain: 'shark-execution', context: Record<string, unknown>): void {
    updateState({
      injectedContexts: [...(getState()?.state.injectedContexts ?? []), JSON.stringify(context)],
    });

    messenger.send({
      from: 'shark-reasoning',
      to: targetBrain,
      type: 'context-inject',
      priority: 'high',
      payload: { thinkingState: context },
      requiresAck: false,
    });
  }

  function detectContextGap(requiredContext: string[], availableContext: string[]): string[] {
    const gaps: string[] = [];
    for (const req of requiredContext) {
      if (!availableContext.includes(req)) {
        gaps.push(req);
      }
    }
    updateState({ contextGaps: gaps });
    return gaps;
  }

  function detectRuntimePatterns(sourceCode: string, context?: CodeContext): RuntimePattern[] {
    const detected: RuntimePattern[] = [];
    const currentGate = getState()?.gate || 'BUILD';
    const ctx: CodeContext = context ?? {
      filePath: '',
      toolName: 'detect',
      gate: currentGate,
      surroundingCode: '',
    };

    try {
      const t1Violations = detectAllT1Violations(sourceCode, ctx);

      for (const rule of t1Violations) {
        const categoryMap: Record<string, RuntimePattern['category']> = {
          'import-safety': 'type-safety',
          'type-safety': 'type-safety',
          'error-handling': 'error-handling',
          'resource-management': 'resource-cleanup',
          'state-management': 'async',
          'dependency-safety': 'type-safety',
          'path-safety': 'config',
          'config-safety': 'config',
          'async-safety': 'async',
          'contract-safety': 'data-contract',
          'theatrical-code': 'spec-fidelity',
          'collection-safety': 'data-contract',
          'testing-anti-pattern': 'spec-fidelity',
          'container-config': 'config',
          'evidence-fraud': 'spec-fidelity',
          'protocol-violation': 'spec-fidelity',
          'config-audit': 'config',
          'identity-scoping': 'spec-fidelity',
          'firewall-bypass': 'spec-fidelity',
          'adversarial-pattern': 'spec-fidelity',
          'lifecycle-violation': 'spec-fidelity',
          'preflight': 'config',
          'anti-derailment': 'spec-fidelity',
          'gap-violation': 'spec-fidelity',
          'evidence': 'spec-fidelity',
        };

        detected.push({
          id: `t1_${rule.detector.id}`,
          category: categoryMap[rule.detector.category] || 'spec-fidelity',
          pattern: rule.detector.description,
          correction: rule.detector.fix,
          applicableGates: [currentGate],
        });
      }
    } catch {
      // T1 analysis failure — fall through to legacy patterns
    }

    for (const pattern of RUNTIME_PATTERNS) {
      if (pattern.applicableGates.includes(currentGate)) {
        switch (pattern.category) {
          case 'error-handling':
            if (/catch\s*\{\s*\}/.test(sourceCode)) detected.push(pattern);
            break;
          case 'resource-cleanup':
            if (/setInterval/.test(sourceCode) && !/clearInterval/.test(sourceCode)) detected.push(pattern);
            break;
          case 'type-safety':
            if (/\bas\s+\w+/.test(sourceCode) && !/typeof|instanceof|Array\.isArray/.test(sourceCode)) detected.push(pattern);
            break;
          case 'async':
            if (/new Promise/.test(sourceCode) && !/\.catch|try\s*\{/.test(sourceCode)) detected.push(pattern);
            break;
          default:
            break;
        }
      }
    }

    if (detected.length > 0) {
      updateState({
        detectedPatterns: [...(getState()?.state.detectedPatterns ?? []), ...detected],
      });
    }

    return detected;
  }

  function recordSpecViolation(violation: string): void {
    const current = getState();
    updateState({
      specViolations: [...(current?.state.specViolations ?? []), violation],
    });

    messenger.send({
      from: 'shark-reasoning',
      to: 'shark-execution',
      type: 'context-inject',
      priority: 'high',
      payload: { specViolation: violation, action: 'Fix before proceeding' },
      requiresAck: true,
    });
  }

  function recordAutoDebugHit(): void {
    const current = getState();
    updateState({
      autoDebugHits: (current?.state.autoDebugHits ?? 0) + 1,
    });
  }

  function readExecutionState(): BrainState | null {
    return stateStore.read('execution-state', 'shark-reasoning');
  }

  function readWorkflowState(): BrainState | null {
    return stateStore.read('workflow-state', 'shark-reasoning');
  }

  function readPlanState(): BrainState | null {
    return stateStore.read('plan-state', 'shark-reasoning');
  }

  feedRulesToBrain();

  return {
    getState,
    updateState,
    injectContext,
    detectContextGap,
    detectRuntimePatterns,
    recordSpecViolation,
    recordAutoDebugHit,
    readExecutionState,
    readWorkflowState,
    readPlanState,
  };
}

function feedRulesToBrain(): void {
  const rules = getT1Rules();
  const ruleSummary = rules.map((r: EnforcementRule) => ({
    id: r.detector.id,
    category: r.detector.category,
    severity: r.detector.severity,
    action: r.enforcementAction,
  }));
  if (ruleSummary.length > 0) {
    void ruleSummary;
  }
}

export type ReasoningBrain = ReturnType<typeof createReasoningBrain>;
