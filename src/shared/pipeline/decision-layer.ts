/**
 * Phase 2: Decision Layer
 *
 * Takes Phase 0 candidates + Phase 1 semantic findings.
 * For each candidate: if confirmed by a semantic finding -> apply enforcementAction.
 * If unconfirmed -> DROPPED (never blocked).
 *
 * A finding confirms a candidate if ANY of:
 *   1. finding.confirmedCandidate === candidate.ruleId
 *   2. finding.ruleId === candidate.semanticRule
 *   3. finding.ruleId starts with candidate.ruleId (prefix match for family rules)
 *   4. Same category + overlapping line range
 */

import type { RegexCandidate } from './regex-candidate.js';
import type { SemanticFinding } from './semantic-analysis-context.js';

export interface DecisionResult {
  blocks: SemanticFinding[];        // enforcementAction: 'block' — these throw
  flags: SemanticFinding[];         // enforcementAction: 'flag' — these warn
  escalations: SemanticFinding[];   // enforcementAction: 'escalate' — these warn + evidence
  dropped: RegexCandidate[];        // Unconfirmed candidates — logged but not acted on
  stats: {
    candidatesIn: number;
    confirmed: number;
    dropped: number;
    blocked: number;
    flagged: number;
  };
}

/**
 * Check if a semantic finding confirms a regex candidate.
 * Uses multiple matching strategies for robustness.
 */
function isConfirmed(candidate: RegexCandidate, finding: SemanticFinding): boolean {
  // Strategy 1: Direct confirmedCandidate link
  if (finding.confirmedCandidate && finding.confirmedCandidate === candidate.ruleId) {
    return true;
  }

  // Strategy 2: Semantic rule match — candidate.semanticRule === finding.ruleId
  if (candidate.semanticRule && candidate.semanticRule === finding.ruleId) {
    return true;
  }

  // Strategy 3: Prefix match — finding.ruleId starts with candidate.ruleId
  //   e.g., finding "P3" confirms candidate "P3"
  //   e.g., finding "SF:no-empty-catch" matches candidate.semanticRule "SF:no-empty-catch"
  if (finding.ruleId === candidate.ruleId) {
    return true;
  }
  if (finding.ruleId.startsWith(candidate.ruleId + '-') || finding.ruleId.startsWith(candidate.ruleId + ':')) {
    return true;
  }

  // Strategy 4: Cross-engine rule family match
  //   RGE P3 <-> SF no-empty-catch (same concept, different ruleId)
  //   RGE P9 <-> SF no-floating-promises
  //   RGE P11 <-> SRE:S1 (theatrical return)
  const CROSS_RULE_MAP: Record<string, string[]> = {
    'P3': ['SF:no-empty-catch', 'no-empty-catch'],
    'P2': ['SF:no-unsafe-cast', 'no-unsafe-cast'],
    'P9': ['SF:no-floating-promises', 'no-floating-promises', 'P9-FLOAT'],
    'P7': ['SF:no-hardcoded-paths', 'no-hardcoded-paths'],
    'P11': ['SRE:S1', 's1-theatrical-return', 'P11'],
    'P4': ['SF:cleanup-paired-intervals', 'cleanup-paired-intervals', 'P4-TIMER'],
    'P12': ['SF:handle-zero-length', 'handle-zero-length', 'AE-EMPTY-SET'],
    'P1': ['RGE:P1', 'p1-defensive-import'],
    'P10': ['RGE:P10', 'p10-output-contract'],
    'P6': ['RGE:P6', 'p6-dependency-verification'],
    'P5': ['RGE:P5'],
    'P8': ['RGE:P8'],
  };
  const relatedRules = CROSS_RULE_MAP[candidate.ruleId];
  if (relatedRules && relatedRules.includes(finding.ruleId)) {
    return true;
  }

  // Strategy 5: Same category + overlapping line range
  if (candidate.line > 0 && finding.line > 0) {
    if (Math.abs(candidate.line - finding.line) <= 5) {
      // Lines are close — check if categories align
      if (candidate.category.includes('error') && finding.ruleId.toLowerCase().includes('catch')) return true;
      if (candidate.category.includes('type') && finding.ruleId.toLowerCase().includes('cast')) return true;
      if (candidate.category.includes('async') && finding.ruleId.toLowerCase().includes('promise')) return true;
    }
  }

  return false;
}

/**
 * Apply the decision layer to candidates + findings.
 *
 * Candidates confirmed by at least one finding get their enforcementAction applied.
 * Candidates with no confirming finding are DROPPED (logged but not blocked).
 *
 * Additionally, standalone findings (not tied to any candidate) with HIGH/CRITICAL
 * severity are also included — these are semantic-only detections that regex
 * missed but semantic engines caught.
 */
export function applyDecisionLayer(
  candidates: RegexCandidate[],
  findings: SemanticFinding[],
): DecisionResult {
  const blocks: SemanticFinding[] = [];
  const flags: SemanticFinding[] = [];
  const escalations: SemanticFinding[] = [];
  const dropped: RegexCandidate[] = [];
  const confirmedCandidateIds = new Set<string>();

  // Phase 1: Match candidates to findings
  for (const candidate of candidates) {
    /** @internal Used by confirmation loop — filters findings matching candidate patterns */
    const confirmingFindings = findings.filter(f => isConfirmed(candidate, f));

    if (confirmingFindings.length > 0) {
      confirmedCandidateIds.add(candidate.ruleId);
      // Use the candidate's enforcementAction — it has the authoritative action
      for (const finding of confirmingFindings) {
        const action = candidate.enforcementAction;
        if (action === 'block') {
          blocks.push({ ...finding, enforcementAction: 'block', confirmedCandidate: candidate.ruleId });
        } else if (action === 'escalate') {
          escalations.push({ ...finding, enforcementAction: 'escalate', confirmedCandidate: candidate.ruleId });
        } else if (action === 'flag') {
          flags.push({ ...finding, enforcementAction: 'flag', confirmedCandidate: candidate.ruleId });
        }
        // 'drop' — don't act on it
      }
    } else {
      // No confirming finding — DROP this candidate
      dropped.push(candidate);
    }
  }

  // Phase 2: Include standalone findings not tied to any candidate
  // These are semantic-only detections (AST rules that caught things regex missed).
  // Only include HIGH/CRITICAL standalone findings as blocks; others as flags.
  for (const finding of findings) {
    const isStandalone = !confirmedCandidateIds.has(finding.ruleId.split(':')[0].split('-')[0]);
    // Skip findings already processed above
    if (blocks.some(b => b.ruleId === finding.ruleId && b.line === finding.line)) continue;
    if (flags.some(f => f.ruleId === finding.ruleId && f.line === finding.line)) continue;
    if (escalations.some(e => e.ruleId === finding.ruleId && e.line === finding.line)) continue;

    if (finding.severity === 'CRITICAL' || finding.severity === 'HIGH') {
      blocks.push({ ...finding, enforcementAction: finding.enforcementAction === 'drop' ? 'flag' : finding.enforcementAction });
    } else if (finding.severity === 'MEDIUM' || finding.severity === 'LOW') {
      flags.push({ ...finding, enforcementAction: 'flag' });
    }
  }

  return {
    blocks,
    flags,
    escalations,
    dropped,
    stats: {
      candidatesIn: candidates.length,
      confirmed: candidates.length - dropped.length,
      dropped: dropped.length,
      blocked: blocks.length,
      flagged: flags.length,
    },
  };
}
