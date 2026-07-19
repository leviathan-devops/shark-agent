/**
 * AnalysisOrder — Bible Order 0-5 classification
 *
 * Order 0: No analysis (pass-through)
 * Order 1: L0 pre-filter (regex/candidate generation — warhead hooks)
 * Order 2: AST walker (structural rules — SemanticFirewall)
 * Order 3: TypeChecker queries (type safety rules — SemanticFirewall)
 * Order 4: CFG/DFA (resource lifecycle, floating promises — SemanticFirewall)
 * Order 5: Execution verification (scope diff, evidence integrity — SemanticFirewall + EvidencePipeline)
 */
export type AnalysisOrder = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * The context in which a tool is being executed.
 * Captures everything needed to dispatch analysis.
 */
export interface ToolExecutionContext {
  toolName: string;
  args: Record<string, unknown>;
  thoughtStream?: string;
  sessionId?: string;
  agentName?: string;
  gate: string;
  iteration?: string;
  filePath?: string;
}

/**
 * Result from a single analysis provider
 */
export interface AnalysisProviderResult {
  provider: 'semantic-firewall' | 'warhead-hooks' | 'evidence-pipeline' | 'merkle-chain' | 'deterministic-rules';
  order: AnalysisOrder;
  passed: boolean;
  diagnostics: Array<{
    rule: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
    message: string;
    findingId?: string;
    filePath?: string;
    line?: number;
    column?: number;
  }>;
  raw?: unknown;
}

/**
 * Consolidated result from the AnalysisOrderDispatcher
 */
export interface AnalysisDispatchResult {
  passed: boolean;
  results: AnalysisProviderResult[];
  evidencePushed: boolean;
  executionAllowed: boolean;
  blocks: string[];
  warnings: string[];
}

/**
 * Configuration for which analysis orders run in which gates
 */
export interface GateAnalysisConfig {
  enabledOrders: AnalysisOrder[];
  requiredToPass: AnalysisOrder[];
}

/**
 * Analysis order routing rules per gate
 */
export const GATE_ANALYSIS_ROUTING: Record<string, GateAnalysisConfig> = {
  PLAN:    { enabledOrders: [0, 1, 2],      requiredToPass: [2] },
  BUILD:   { enabledOrders: [0, 1, 2, 3],   requiredToPass: [2] },
  VERIFY:  { enabledOrders: [0, 1, 2, 3, 4], requiredToPass: [2, 4] },
  TEST:    { enabledOrders: [0, 1, 2, 3, 4], requiredToPass: [2, 3, 4] },
  AUDIT:   { enabledOrders: [0, 1, 2, 3, 4, 5], requiredToPass: [2, 3, 4, 5] },
  DELIVERY:{ enabledOrders: [0, 1, 2, 3, 4, 5], requiredToPass: [2, 3, 4, 5] },
};
