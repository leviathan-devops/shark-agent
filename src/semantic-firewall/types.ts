export type AnalysisPhase = 'write-time' | 'post-write';
/** Severity scale — Appendix B 6-level hierarchy (includes PASS for clean results). */
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' | 'PASS';

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
