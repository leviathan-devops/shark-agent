/**
 * Pattern Memory — Rule V-3: Behavioral Pattern Memory
 * File: src/shark/planning-brain/cse/pattern-memory.ts
 *
 * V-3: The engine maintains a per-session behavioral history and detects patterns
 * across the trajectory that single-claim verification cannot see. Known
 * derailment templates — learned from past sessions — flag trajectories that
 * historically correlate with failure.
 *
 * Tracks across session:
 * - claimsWithoutEvidence count
 * - staleEvidenceClaims count
 * - theatricalEvidenceClaims count (hardcoded evidence detected)
 * - explorationRatio (reads / (reads + writes))
 * - derailmentMatches against known templates
 */

import * as path from 'node:path';
import * as fs from 'node:fs';

import type {
  BehavioralAssessment,
  BehavioralCondition,
  ClaimVerification,
  DerailmentMatch,
  DerailmentTemplate,
  DetectedPattern,
  PatternEvidence,
  PatternHistory,
  ToolCall,
} from './cse-types.js';

// ===========================================================================
// BUILT-IN DERAILMENT TEMPLATES
// ===========================================================================

const BUILTIN_TEMPLATES: DerailmentTemplate[] = [
  {
    templateId: 'DDT-001',
    name: 'Build Success Without Build Command',
    signature: [
      { field: 'claim_count', operator: 'GTE', value: 2 },
    ],
    failureCorrelation: 0.92,
    observedCount: 47,
    intervention: 'Agent has claimed build success multiple times but no build command was ' +
                  'detected in the tool trajectory. Run "bun build" and capture the actual ' +
                  'output before claiming success.',
  },
  {
    templateId: 'DDT-002',
    name: 'Theatrical Evidence Creation',
    signature: [],
    failureCorrelation: 0.88,
    observedCount: 31,
    intervention: 'Evidence file appears to have been created via manual write/echo rather ' +
                  'than actual tool output. This is THEATRICAL EVIDENCE. Re-run the actual ' +
                  'test/build tool to regenerate.',
  },
  {
    templateId: 'DDT-003',
    name: 'Exploration Stall (Read-Heavy Build Gate)',
    signature: [
      { field: 'gate', operator: 'EQ', value: 'BUILD' },
      { field: 'ratio', operator: 'GT', value: 0.8 },
    ],
    failureCorrelation: 0.75,
    observedCount: 62,
    intervention: 'Agent has made many read calls but zero write calls during the BUILD ' +
                  'gate. This is exploration without implementation. Write code now.',
  },
  {
    templateId: 'DDT-005',
    name: 'Claim-Evidence Mismatch Cascade',
    signature: [
      { field: 'claim_count', operator: 'GTE', value: 3 },
    ],
    failureCorrelation: 0.86,
    observedCount: 19,
    intervention: 'Multiple claims have been contradicted by filesystem reality. The agent ' +
                  'is out of sync with actual state. Stop, re-read current state, align claims.',
  },
];

// ===========================================================================
// PATTERN MEMORY ENGINE
// ===========================================================================

const EXPLORE_TOOLS = new Set(['read', 'glob', 'grep', 'ls']);
const IMPLEMENT_TOOLS = new Set(['write', 'edit', 'bash', 'patch', 'create']);

export class PatternMemoryEngine {
  private store: Map<string, PatternHistory> = new Map();
  private templates: DerailmentTemplate[];
  private _patternsDir: string;

  constructor(basePath: string) {
    this.templates = [...BUILTIN_TEMPLATES];
    this._patternsDir = path.join(basePath, '.shark', 'evidence', 'cse', 'patterns');
    if (!fs.existsSync(this._patternsDir)) {
      fs.mkdirSync(this._patternsDir, { recursive: true });
    }
  }

  /**
   * Update the pattern history with new verification results.
   * Returns the BehavioralAssessment for this cycle.
   */
  update(
    sessionId: string,
    claimVerifications: ClaimVerification[],
    toolCalls: ToolCall[],
    sessionStart: number,
  ): BehavioralAssessment {
    let history = this.store.get(sessionId);
    if (!history) {
      history = {
        sessionId,
        claims: [],
        verifications: [],
        patterns: [],
        claimsWithoutEvidence: 0,
        staleEvidenceClaims: 0,
        theatricalEvidenceClaims: 0,
        explorationRatio: 0,
        derailmentMatches: [],
        sessionStart,
        lastUpdate: Date.now(),
      };
      this.store.set(sessionId, history);
    }

    // Accumulate claims and verifications
    history.claims.push(...claimVerifications.map((v: ClaimVerification) => v.claim));
    history.verifications.push(...claimVerifications);

    // Update counters
    history.claimsWithoutEvidence = this.countClaimsWithoutEvidence(history);
    history.staleEvidenceClaims = this.countStaleEvidenceClaims(history);
    history.theatricalEvidenceClaims = this.countTheatricalEvidence(history);
    history.explorationRatio = this.computeExplorationRatio(toolCalls);

    // Detect patterns
    history.patterns = this.detectPatterns(history);

    // Match templates
    history.derailmentMatches = this.matchTemplates(history);

    // Compute risk
    const derailmentRisk = this.computeRisk(history);

    history.lastUpdate = Date.now();

    return {
      patterns: history.patterns,
      derailmentRisk,
      learned: [],
      workflowAlignment: 0,
      claimsWithoutEvidence: history.claimsWithoutEvidence,
      staleEvidenceClaims: history.staleEvidenceClaims,
      theatricalEvidenceClaims: history.theatricalEvidenceClaims,
      explorationRatio: history.explorationRatio,
      derailmentMatches: history.derailmentMatches,
    };
  }

  /**
   * Get the current pattern history for a session.
   */
  getHistory(sessionId: string): PatternHistory | undefined {
    return this.store.get(sessionId);
  }

  // ===========================================================================
  // COUNTER METHODS
  // ===========================================================================

  private countClaimsWithoutEvidence(history: PatternHistory): number {
    return history.verifications.filter((v: ClaimVerification) =>
      v.verdict === 'INSUFFICIENT_EVIDENCE' ||
      v.verdict === 'CONTRADICTED' ||
      (v.evidence && !v.evidence.valid)
    ).length;
  }

  private countStaleEvidenceClaims(history: PatternHistory): number {
    return history.verifications.filter((v: ClaimVerification) =>
      v.evidence?.creationProvenance === 'STALE'
    ).length;
  }

  private countTheatricalEvidence(history: PatternHistory): number {
    return history.verifications.filter((v: ClaimVerification) =>
      v.evidence?.creationProvenance === 'SUSPICIOUS'
    ).length;
  }

  /**
   * Compute read-to-write ratio: reads / (reads + writes).
   */
  private computeExplorationRatio(toolCalls: ToolCall[]): number {
    if (toolCalls.length === 0) return 0;

    let exploreCount = 0;
    let implementCount = 0;

    for (const call of toolCalls) {
      if (EXPLORE_TOOLS.has(call.toolName)) exploreCount++;
      else if (IMPLEMENT_TOOLS.has(call.toolName)) implementCount++;
    }

    const total = exploreCount + implementCount;
    return total > 0 ? exploreCount / total : 0;
  }

  // ===========================================================================
  // PATTERN DETECTION
  // ===========================================================================

  private detectPatterns(history: PatternHistory): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    // PATTERN 1: Claims without evidence
    if (history.claimsWithoutEvidence >= 2) {
      const evidenceRefs: PatternEvidence[] = history.verifications
        .filter((v: ClaimVerification) => v.verdict === 'INSUFFICIENT_EVIDENCE' || v.verdict === 'CONTRADICTED')
        .map((v: ClaimVerification) => ({ type: 'claim' as const, ref: v.claim.claimId, detail: v.claim.rawText }));

      patterns.push({
        patternId: 'P-CLAIMS-NO-EVIDENCE',
        template: 'Claims made without supporting evidence files',
        occurrences: history.claimsWithoutEvidence,
        evidence: evidenceRefs,
        severity: history.claimsWithoutEvidence >= 3 ? 'CRITICAL' : 'WARN',
        derailmentCorrelation: Math.min(0.95, 0.5 + history.claimsWithoutEvidence * 0.1),
      });
    }

    // PATTERN 2: Stale evidence usage
    if (history.staleEvidenceClaims >= 1) {
      const evidenceRefs: PatternEvidence[] = history.verifications
        .filter((v: ClaimVerification) => v.evidence?.creationProvenance === 'STALE')
        .map((v: ClaimVerification) => ({ type: 'evidence_check' as const, ref: v.evidence!.filePath, detail: 'stale' }));

      patterns.push({
        patternId: 'P-STALE-EVIDENCE',
        template: 'Claims backed by stale (out-of-session) evidence',
        occurrences: history.staleEvidenceClaims,
        evidence: evidenceRefs,
        severity: 'WARN',
        derailmentCorrelation: 0.7,
      });
    }

    // PATTERN 3: Theatrical evidence
    if (history.theatricalEvidenceClaims >= 1) {
      const evidenceRefs: PatternEvidence[] = history.verifications
        .filter((v: ClaimVerification) => v.evidence?.creationProvenance === 'SUSPICIOUS')
        .map((v: ClaimVerification) => ({ type: 'evidence_check' as const, ref: v.evidence!.filePath, detail: 'theatrical' }));

      patterns.push({
        patternId: 'P-THEATRICAL-EVIDENCE',
        template: 'Evidence files that fail content validation (hand-written, not machine output)',
        occurrences: history.theatricalEvidenceClaims,
        evidence: evidenceRefs,
        severity: 'CRITICAL',
        derailmentCorrelation: 0.88,
      });
    }

    // PATTERN 4: Exploration stall
    if (history.explorationRatio > 0.8) {
      patterns.push({
        patternId: 'P-EXPLORATION-STALL',
        template: 'High read-to-write ratio — exploration without implementation',
        occurrences: 1,
        evidence: [{
          type: 'tool_call' as const,
          ref: 'aggregate',
          detail: (history.explorationRatio * 100).toFixed(0) + '% reads',
        }],
        severity: history.explorationRatio > 0.9 ? 'CRITICAL' : 'WARN',
        derailmentCorrelation: 0.75,
      });
    }

    return patterns;
  }

  // ===========================================================================
  // TEMPLATE MATCHING
  // ===========================================================================

  private matchTemplates(history: PatternHistory): DerailmentMatch[] {
    const matches: DerailmentMatch[] = [];

    for (const template of this.templates) {
      const matchScore = this.scoreTemplateMatch(template, history);
      if (matchScore >= 0.7) {
        // For templates with empty signature, check specialized conditions
        if (template.templateId === 'DDT-002' && history.theatricalEvidenceClaims > 0) {
          matches.push({
            templateId: template.templateId,
            templateName: template.name,
            matchScore: Math.min(1.0, matchScore + 0.3),
            matchedSequence: ['theatricalEvidenceClaims > 0'],
            intervention: template.intervention,
          });
        } else if (template.signature.length > 0) {
          matches.push({
            templateId: template.templateId,
            templateName: template.name,
            matchScore,
            matchedSequence: template.signature.map((s: BehavioralCondition) =>
              s.field + ' ' + s.operator + ' ' + String(s.value)
            ),
            intervention: template.intervention,
          });
        }
      }
    }

    return matches.sort((a: DerailmentMatch, b: DerailmentMatch) => b.matchScore - a.matchScore);
  }

  private scoreTemplateMatch(template: DerailmentTemplate, history: PatternHistory): number {
    if (template.signature.length === 0) {
      // Special: templates without signature use specialized detection
      if (template.templateId === 'DDT-002') {
        return history.theatricalEvidenceClaims > 0 ? 0.9 : 0;
      }
      return 0;
    }

    let matchedConditions = 0;
    for (const cond of template.signature) {
      if (this.evaluateCondition(cond, history)) {
        matchedConditions++;
      }
    }
    return matchedConditions / template.signature.length;
  }

  private evaluateCondition(cond: BehavioralCondition, history: PatternHistory): boolean {
    switch (cond.field) {
      case 'claim_count':
        return this.compare(history.claims.length, cond.operator, cond.value as number);
      case 'gate':
        // Gate-based conditions are evaluated when gate context is available
        return true;
      case 'ratio':
        return this.compare(history.explorationRatio, cond.operator, cond.value as number);
      case 'evidence_present':
        return this.compare(history.verifications.filter((v: ClaimVerification) => v.evidence).length,
          cond.operator, cond.value as number);
      default:
        return false;
    }
  }

  private compare(left: number, op: string, right: number): boolean {
    switch (op) {
      case 'GT': return left > right;
      case 'GTE': return left >= right;
      case 'LT': return left < right;
      case 'LTE': return left <= right;
      case 'EQ': return left === right;
      default: return false;
    }
  }

  // ===========================================================================
  // RISK COMPUTATION
  // ===========================================================================

  private computeRisk(history: PatternHistory): number {
    let risk = 0;

    // Each CRITICAL pattern adds up to 0.3
    const critical = history.patterns.filter((p: DetectedPattern) => p.severity === 'CRITICAL');
    risk += Math.min(0.6, critical.length * 0.3);

    // Each WARN pattern adds up to 0.1
    const warns = history.patterns.filter((p: DetectedPattern) => p.severity === 'WARN');
    risk += Math.min(0.3, warns.length * 0.1);

    // Derailment template matches
    for (const match of history.derailmentMatches) {
      const template = this.templates.find((t: DerailmentTemplate) => t.templateId === match.templateId);
      if (template) {
        risk += match.matchScore * template.failureCorrelation * 0.4;
      }
    }

    return Math.min(1.0, risk);
  }

  // ===========================================================================
  // PERSISTENCE & LEARNING LOOP
  // ===========================================================================

  /**
   * Persist a detected pattern to disk for cross-session recall.
   * Writes JSON to `.shark/evidence/cse/patterns/<id>.json`.
   */
  storePattern(pattern: DetectedPattern): void {
    const fp = path.join(
      this._patternsDir,
      `${pattern.id ?? pattern.patternHash ?? pattern.patternId ?? Date.now()}.json`,
    );
    fs.writeFileSync(fp, JSON.stringify(pattern, null, 2));
  }

  /**
   * Recall a pattern from disk by fingerprint (id or patternHash).
   * Returns the cached DetectedPattern or null if not found.
   */
  recallPattern(fingerprint: string): DetectedPattern | null {
    if (!fs.existsSync(this._patternsDir)) return null;
    const files = fs.readdirSync(this._patternsDir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const data = fs.readFileSync(path.join(this._patternsDir, file), 'utf-8');
        const pattern: DetectedPattern = JSON.parse(data);
        if (
          pattern.patternHash === fingerprint ||
          pattern.id === fingerprint ||
          pattern.patternId === fingerprint
        ) {
          return pattern;
        }
      } catch {
        /* skip corrupt files */
      }
    }
    return null;
  }

  /**
   * Adjust the confidence of a stored pattern over time.
   * Confidence is clamped to [0, 1]. Pattern is re-persisted after adjustment.
   */
  adjustConfidence(patternId: string, delta: number): void {
    const pattern = this.recallPattern(patternId);
    if (pattern) {
      pattern.confidence = Math.max(0, Math.min(1, (pattern.confidence ?? 0.5) + delta));
      this.storePattern(pattern);
    }
  }
}
