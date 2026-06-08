export type AnalysisPhase = 'write-time' | 'post-write';
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export interface RuleConfig {
  name: string;
  severity: Severity;
  enabled: boolean;
  orders: number;
}

export interface FirewallDiag {
  rule: string;
  severity: Severity;
  file: string;
  line: number;
  column: number;
  message: string;
  nodeKind: string;
  sourceSnippet?: string;
  phase: AnalysisPhase;
}

export interface FirewallResult {
  passed: boolean;
  diagnostics: FirewallDiag[];
  phase: AnalysisPhase;
}
