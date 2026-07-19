/**
 * Deterministic Rules — behavioral pattern detection.
 *
 * Each rule wraps a set of regex patterns into a self-contained function
 * that receives tool execution context and returns violations.
 *
 * These are Bible-exempt (§5.1 exception: derailment detection on free-text reasoning).
 * They operate at Order 1 (string pattern matching) for behavioral detection,
 * which the Bible explicitly allows for agent reasoning analysis.
 */

export interface RuleContext {
  toolName: string;
  args: Record<string, unknown>;
  thoughtStream?: string;
  filePath?: string;
  agentName?: string;
  gate: string;
  /** Recently edited files from EditHistory (Bible §6 Phase 3 context-aware enforcement) */
  recentFiles?: string[];
}

export interface RuleViolation {
  ruleId: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  message: string;
  evidence: string;
}

export interface DeterministicRule {
  id: string;
  name: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  evaluate(context: RuleContext): RuleViolation[];
}
