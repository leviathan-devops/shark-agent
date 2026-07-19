/**
 * Behavioral Rule Engine (PB-3) — Structural Predicates on ThoughtStreamGraph
 * ============================================================================
 * File: src/shark/planning-brain/behavioral-rules.ts
 *
 * Six behavioral rules (BR-1 through BR-6) that are pure structural predicates
 * on the ThoughtStreamGraph. Each rule is analogous to how SRE's S1-S5 rules
 * are predicates on the per-function CodeConstruct + CFG.
 *
 *   SRE:  ts.Program -> AST -> CodeConstructTree -> CFG  -> S1-S5 rules
 *   PB:   NLP signals -> ThoughtConstruct -> ThoughtStreamGraph -> BR-1..BR-6
 *
 * Same structural depth. Different input domain. Zero model tokens.
 *
 * Design Principles:
 *   - Each rule is a pure function: (graph, ctx) -> BehavioralFinding[]
 *   - Every finding carries an evidence chain + blind spots + remediation
 *   - All rules are fault-tolerant (try-catch isolated — one rule crash
 *     cannot abort the analysis; it produces an engine-fault finding)
 *   - NO regex anywhere (Iron Law 4 — structural predicates only)
 *   - Confidence computed, never guessed (Pillar 5)
 *   - Blind spots reported transparently on every run (Pillar 4)
 *
 * Spec: PLANNING_BRAIN_OVERHAUL_SPEC.md, section PB-3
 */

import type { ThoughtConstruct } from './thought-construct-builder.js';
import type { ThoughtStreamGraph } from './thought-stream-graph.js';

// ===========================================================================
// PUBLIC TYPE DEFINITIONS
// ===========================================================================

export interface BehavioralFinding {
  ruleId: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  enforcementAction: 'block' | 'flag' | 'inject' | 'drop';
  /** Precision bullet — 50-80 chars max. */
  message: string;
  evidence: BehavioralEvidenceStep[];
  /** For T1 injectable — what agent SHOULD do. */
  remediation: string;
  blindSpots: string[];
}

export interface BehavioralEvidenceStep {
  /** The predicate being checked. */
  claim: string;
  /** Whether this step held true (true) or failed (false -> root cause). */
  verified: boolean;
  /** Where the evidence was sourced from. */
  source: 'thought-graph' | 'tool-history' | 'filesystem' | 'nlp-pipeline';
  /** Supporting data for auditability. */
  data: unknown;
}

export interface BehavioralBlindSpotReport {
  messageCoverage: number;
  nlpPipelineAvailable: boolean;
  verbFrameMatchRate: number;
  toolHistoryDepth: number;
  filesystemBaselineAvailable: boolean;
  limitations: string[];
}

export interface RuleContext {
  toolHistory: Array<{ toolName: string; category: string }>;
  filesystemState: { bytesWritten: number; evidenceFilesCreated: number } | null;
  gate: string;
  taskQueuePending: string[];
  recentFiles: string[];
}

export interface BehavioralAnalysisResult {
  findings: BehavioralFinding[];
  confidence: number;
  blindSpotReport: BehavioralBlindSpotReport;
}

// ===========================================================================
// LOCAL TYPES — Structural Contract with PB-1 / PB-2
// ===========================================================================

/**
 * Thought construct kinds, matching PB-1 (ThoughtConstruct Builder) spec.
 */
export type ThoughtKind =
  | 'claim' | 'question' | 'command' | 'reasoning'
  | 'verification' | 'planning' | 'error-report'
  | 'context-recall' | 'correction';

/**
 * Directed edge types in the ThoughtStreamGraph, matching PB-2 spec.
 */
export type ThoughtEdgeType =
  | 'claim-to-evidence' | 'claim-to-nothing' | 'question-to-answer'
  | 'plan-to-action' | 'topic-continuation' | 'topic-shift'
  | 'context-recall' | 'correction' | 'error-to-retry' | 'error-to-pivot';

/** A directed edge in the thought stream (matches PB-2 ThoughtEdge shape). */
export interface ThoughtEdge {
  from: number;
  to: number;
  type: ThoughtEdgeType;
  weight: number;
}

/**
 * Rule contract — each rule is registered with an id, description, and a
 * pure check function. Structurally parallel to SRE's HonestyRule.
 */
export interface BehavioralRule {
  id: string;
  description: string;
  check: (graph: ThoughtStreamGraph, ctx: RuleContext) => BehavioralFinding[];
}

// ===========================================================================
// CONSTANTS
// ===========================================================================

const PLANNING_KINDS: ReadonlySet<string> = new Set(['planning', 'reasoning']);
const COMMAND_KINDS: ReadonlySet<string> = new Set(['command']);
const VERIFY_TOOL_CATEGORIES: ReadonlySet<string> = new Set(['TEST', 'AUDIT', 'VERIFY']);
const VERIFY_TOOL_NAMES: ReadonlySet<string> = new Set([
  'test', 'verify', 'check', 'audit', 'validate', 'inspect', 'examine',
  'shark-test-runner', 'shark-audit', 'shark-run-trident', 'shark-evidence',
]);

const MAX_GATE_FINDINGS = 8;

// ===========================================================================
// DEFENSIVE ACCESS HELPERS
// ===========================================================================
// These provide runtime safety when ThoughtStreamGraph / ThoughtConstruct
// shapes come from sibling modules (PB-1, PB-2). A structural mismatch
// degrades to a safe default rather than crashing the analysis.

function graphNodes(graph: ThoughtStreamGraph): ThoughtConstruct[] {
  try {
    const g = graph as unknown as {
      nodes?: ThoughtConstruct[];
      getNodes?: () => ThoughtConstruct[];
      getRecent?: (n: number) => ThoughtConstruct[];
    };
    if (Array.isArray(g.nodes)) return g.nodes;
    if (typeof g.getNodes === 'function') return g.getNodes() ?? [];
    // PB-2 exposes getRecent(n) — request a large window to get all nodes
    if (typeof g.getRecent === 'function') return g.getRecent(50) ?? [];
  } catch (err) {
    // Defensive: PB-2 graph shape may differ at runtime — degrade to empty
    void err;
  }
  return [];
}

function graphCall<T>(graph: ThoughtStreamGraph, method: string, ...args: unknown[]): T {
  try {
    const fn = (graph as unknown as Record<string, unknown>)[method];
    if (typeof fn === 'function') {
      return (fn as (...a: unknown[]) => T)(...args);
    }
  } catch (err) {
    // Defensive: method may not exist on PB-2 graph — degrade to default
    void err;
  }
  return [] as unknown as T;
}

function cKind(c: ThoughtConstruct): string {
  try {
    return (c as unknown as { kind?: string }).kind ?? 'unknown';
  } catch (err) {
    void err;
    return 'unknown';
  }
}

function cStr(c: ThoughtConstruct, field: string): string {
  try {
    const v = (c as unknown as Record<string, unknown>)[field];
    return typeof v === 'string' ? v : '';
  } catch (err) {
    void err;
    return '';
  }
}

function cHasField(c: ThoughtConstruct, field: string): boolean {
  try {
    const v = (c as unknown as Record<string, unknown>)[field];
    return v !== null && v !== undefined;
  } catch (err) {
    void err;
    return false;
  }
}

// ===========================================================================
// BR-1: VERIFY BEFORE CLAIM
// Analog to SRE S1 — every claim must have adjacent verification.
// ===========================================================================

/**
 * FIRES when: a claim node has no adjacent evidence edge in the thought graph.
 *
 * Cross-checks: did verify tools run? Were evidence files created?
 * If neither tool history nor filesystem corroborates the claim, the finding
 * is CRITICAL with a 'block' enforcement action.
 */
export function ruleVerifyBeforeClaim(
  graph: ThoughtStreamGraph,
  ctx: RuleContext,
): BehavioralFinding[] {
  const findings: BehavioralFinding[] = [];
  const ungrounded = graphCall<ThoughtConstruct[]>(graph, 'findUngroundedClaims');

  if (ungrounded.length === 0) return findings;

  const verifyToolsRan = ctx.toolHistory.some(
    (t: { toolName: string; category: string }) => VERIFY_TOOL_CATEGORIES.has(t.category) || VERIFY_TOOL_NAMES.has(t.toolName),
  );
  const evidenceFilesExist =
    ctx.filesystemState !== null && ctx.filesystemState.evidenceFilesCreated > 0;

  for (const claim of ungrounded) {
    const claimText = cStr(claim, 'claimText') || '(unlabeled claim)';
    findings.push({
      ruleId: 'BR-1',
      severity: 'CRITICAL',
      enforcementAction: 'block',
      message: `Ungrounded claim: "${claimText.slice(0, 40)}" lacks verification`,
      evidence: [
        { claim: 'Claim node exists in thought graph', verified: true,
          source: 'thought-graph', data: { kind: cKind(claim), claimText } },
        { claim: 'Claim has adjacent evidence edge', verified: false,
          source: 'thought-graph', data: null },
        { claim: 'Verify tools were invoked this session', verified: verifyToolsRan,
          source: 'tool-history',
          data: ctx.toolHistory.map((t: { toolName: string; category: string }) => t.toolName).slice(0, 5) },
        { claim: 'Evidence files created on filesystem', verified: evidenceFilesExist,
          source: 'filesystem',
          data: ctx.filesystemState ? ctx.filesystemState.evidenceFilesCreated : 0 },
      ],
      remediation:
        'Verify the claim before asserting it. Run a test, check the filesystem, ' +
        'or cite an evidence file. Claims without verification are theatrical.',
      blindSpots: [
        'Cannot assess claim truthfulness without domain knowledge',
        'Filesystem state is a point-in-time snapshot',
      ],
    });
  }
  return findings;
}

// ===========================================================================
// BR-2: DOCUMENT BEFORE EXECUTE
// At BUILD gate, planning constructs should precede command constructs.
// ===========================================================================

/**
 * FIRES when: at BUILD gate, a command construct appears with no preceding
 * planning construct in the thought stream.
 *
 * The predicate checks graph node ordering — planning/reasoning kinds should
 * appear before command kinds in the chronological node sequence.
 */
export function ruleDocumentBeforeExecute(
  graph: ThoughtStreamGraph,
  ctx: RuleContext,
): BehavioralFinding[] {
  if (ctx.gate !== 'BUILD') return [];

  const findings: BehavioralFinding[] = [];
  const nodes = graphNodes(graph);

  let firstCommandIdx = -1;
  let lastPlanningIdx = -1;
  let planningCount = 0;
  let commandCount = 0;

  for (let i = 0; i < nodes.length; i++) {
    const kind = cKind(nodes[i]);
    if (COMMAND_KINDS.has(kind)) {
      commandCount++;
      if (firstCommandIdx === -1) firstCommandIdx = i;
    }
    if (PLANNING_KINDS.has(kind)) {
      planningCount++;
      lastPlanningIdx = i;
    }
  }

  if (firstCommandIdx === -1) return findings;
  const planningPrecedes = lastPlanningIdx !== -1 && lastPlanningIdx < firstCommandIdx;
  if (planningPrecedes) return findings;

  findings.push({
    ruleId: 'BR-2',
    severity: 'HIGH',
    enforcementAction: 'flag',
    message: `Execution before planning: ${commandCount} command(s) at BUILD gate`,
    evidence: [
      { claim: 'Current gate is BUILD', verified: true,
        source: 'tool-history', data: ctx.gate },
      { claim: 'Planning construct precedes first command', verified: false,
        source: 'thought-graph',
        data: { firstCommandIdx, lastPlanningIdx, planningCount, commandCount } },
      { claim: 'At least one planning/reasoning construct exists', verified: planningCount > 0,
        source: 'thought-graph', data: planningCount },
    ],
    remediation:
      'Document the plan before executing. Add a planning or reasoning step that ' +
      'outlines what the command will accomplish and why.',
    blindSpots: [
      'Node ordering assumes chronological insertion',
      'Cannot verify planning quality — only presence',
    ],
  });
  return findings;
}

// ===========================================================================
// BR-3: FAIL FAST DON'T RETRY
// Error-to-retry edges should be rare; error-to-pivot preferred.
// ===========================================================================

/**
 * FIRES when: error-to-retry edges exceed 2 AND outnumber error-to-pivot
 * edges. This indicates the agent is repeating failed approaches instead of
 * pivoting to a new strategy.
 */
export function ruleFailFastNotRetry(
  graph: ThoughtStreamGraph,
  ctx: RuleContext,
): BehavioralFinding[] {
  const findings: BehavioralFinding[] = [];

  const retryEdges = graphCall<ThoughtEdge[]>(graph, 'getEdgesByType', 'error-to-retry');
  const pivotEdges = graphCall<ThoughtEdge[]>(graph, 'getEdgesByType', 'error-to-pivot');

  const retryCount = Array.isArray(retryEdges) ? retryEdges.length : 0;
  const pivotCount = Array.isArray(pivotEdges) ? pivotEdges.length : 0;

  if (retryCount <= 2) return findings;
  if (retryCount <= pivotCount) return findings;

  const ratio = pivotCount > 0 ? retryCount / pivotCount : Infinity;
  findings.push({
    ruleId: 'BR-3',
    severity: 'MEDIUM',
    enforcementAction: 'inject',
    message: `Retry loop: ${retryCount} retries vs ${pivotCount} pivots (ratio ${isFinite(ratio) ? ratio.toFixed(1) : 'inf'})`,
    evidence: [
      { claim: 'Error-to-retry edges exceed threshold (2)', verified: true,
        source: 'thought-graph', data: { retryCount, threshold: 2 } },
      { claim: 'Retries outnumber pivots', verified: true,
        source: 'thought-graph', data: { retryCount, pivotCount, ratio } },
      { claim: 'Agent pivoted to new strategy after failure', verified: false,
        source: 'thought-graph', data: { pivotCount } },
    ],
    remediation:
      'Stop retrying the same approach. Pivot: change the method, consult prior ' +
      'context, or escalate. Repeated retries on the same error waste tokens.',
    blindSpots: [
      'Cannot distinguish retries of different errors from retries of same error',
      `Tool history depth: ${ctx.toolHistory.length} calls`,
    ],
  });
  return findings;
}

// ===========================================================================
// BR-4: NO CIRCULAR REASONING
// No cycles in thought graph where claim repeats without new evidence.
// ===========================================================================

/**
 * FIRES when: the thought graph contains a cycle — a path that returns to a
 * claim node without introducing new evidence. This is the planning-brain
 * analog of circular imports in code.
 */
export function ruleNoCircularReasoning(
  graph: ThoughtStreamGraph,
  _ctx: RuleContext,
): BehavioralFinding[] {
  const findings: BehavioralFinding[] = [];

  // PB-2 detectCycles() returns { hasCycle: boolean; cycles: number[][] }
  const cycleResult = graphCall<{ hasCycle: boolean; cycles: number[][] }>(
    graph, 'detectCycles',
  );
  const cycles = cycleResult && Array.isArray(cycleResult.cycles)
    ? cycleResult.cycles
    : [];
  if (cycles.length === 0) return findings;

  const cycleLengths = cycles.map((c: number[]) => (Array.isArray(c) ? c.length : 0));
  const longestCycle = Math.max(...cycleLengths, 0);

  findings.push({
    ruleId: 'BR-4',
    severity: 'HIGH',
    enforcementAction: 'flag',
    message: `Circular reasoning: ${cycles.length} cycle(s), longest ${longestCycle} nodes`,
    evidence: [
      { claim: 'Thought graph contains at least one cycle', verified: true,
        source: 'thought-graph', data: { cycleCount: cycles.length, longestCycle } },
      { claim: 'Cycles introduce new evidence on revisit', verified: false,
        source: 'thought-graph', data: cycleLengths },
      { claim: 'No claim repeats without new supporting evidence', verified: false,
        source: 'thought-graph', data: null },
    ],
    remediation:
      'Break the cycle by introducing new evidence or a correction. Circular ' +
      'reasoning means the argument depends on its own conclusion.',
    blindSpots: [
      'Cycle detection uses DFS — very large graphs may have false negatives',
      'Cannot assess whether a cycle is productive (deliberate iteration)',
    ],
  });
  return findings;
}

// ===========================================================================
// BR-5: GATE-APPROPRIATE BEHAVIOR
// Agent actions match gate expectations. Uses enforcement from IntentClassifier.
// ===========================================================================

/**
 * FIRES when: a thought construct carries enforcement level 'CRITICAL',
 * meaning the underlying action violates the gate matrix. The enforcement
 * level is pre-computed by IntentClassifier and carried on ThoughtConstruct.
 */
export function ruleGateAppropriate(
  graph: ThoughtStreamGraph,
  ctx: RuleContext,
): BehavioralFinding[] {
  const findings: BehavioralFinding[] = [];
  const nodes = graphNodes(graph);

  for (const node of nodes) {
    if (findings.length >= MAX_GATE_FINDINGS) break;
    const enforcement = cStr(node, 'enforcement');
    if (enforcement !== 'CRITICAL') continue;

    const kind = cKind(node);
    const action = cStr(node, 'targetEntity') || kind;
    findings.push({
      ruleId: 'BR-5',
      severity: 'CRITICAL',
      enforcementAction: 'block',
      message: `Gate violation: "${action.slice(0, 35)}" blocked at ${ctx.gate} gate`,
      evidence: [
        { claim: `Construct enforcement is CRITICAL at ${ctx.gate} gate`, verified: true,
          source: 'thought-graph', data: { enforcement, kind, gate: ctx.gate } },
        { claim: 'Action is permitted in current gate', verified: false,
          source: 'nlp-pipeline', data: { action, gate: ctx.gate } },
      ],
      remediation:
        `This action is not allowed at the ${ctx.gate} gate. Wait for the ` +
        'appropriate gate or use a non-destructive alternative (READ, QUERY, EXPLORE).',
      blindSpots: [
        'Enforcement level depends on IntentClassifier accuracy',
        'Cannot assess intent quality — only gate compliance',
      ],
    });
  }
  return findings;
}

// ===========================================================================
// BR-6: CONTEXT CONTINUITY
// Agent should reference prior context, not re-discover it.
// ===========================================================================

/**
 * FIRES when: more than 3 orphaned topics exist — topics with no context-recall
 * edge linking them to prior context. This indicates the agent is re-discovering
 * information it already had rather than building on prior context.
 */
export function ruleContextContinuity(
  graph: ThoughtStreamGraph,
  ctx: RuleContext,
): BehavioralFinding[] {
  const findings: BehavioralFinding[] = [];
  const orphans = graphCall<ThoughtConstruct[]>(graph, 'findOrphanedTopics');

  if (!Array.isArray(orphans) || orphans.length <= 3) return findings;

  const orphanKinds = orphans.map((o: ThoughtConstruct) => cKind(o));
  findings.push({
    ruleId: 'BR-6',
    severity: 'MEDIUM',
    enforcementAction: 'inject',
    message: `Context discontinuity: ${orphans.length} orphaned topics lack recall links`,
    evidence: [
      { claim: 'Orphaned topic count exceeds threshold (3)', verified: true,
        source: 'thought-graph', data: { orphanCount: orphans.length, threshold: 3 } },
      { claim: 'Topics linked to prior context via recall edges', verified: false,
        source: 'thought-graph', data: orphanKinds },
      { claim: 'Agent references prior messages/tasks/files', verified: false,
        source: 'thought-graph',
        data: { recentFiles: ctx.recentFiles.length, pendingTasks: ctx.taskQueuePending.length } },
    ],
    remediation:
      'Reference prior context instead of re-deriving it. Use context-recall to ' +
      'link current topics to established facts, avoiding redundant exploration.',
    blindSpots: [
      'Topic extraction depends on NLP pipeline quality',
      'Some orphans may be legitimately new topics',
    ],
  });
  return findings;
}

// ===========================================================================
// BR-7: CIRCULAR REASONING DETECTION (SNAPSHOT-BASED)
// Detects when the agent repeats the same conclusion with same/non-expanding
// evidence. Uses semantic hashing from ThoughtStreamGraph snapshots.
// ===========================================================================

/**
 * FIRES when: multiple snapshots share the same semantic hash with identical
 * or non-expanding evidence sets. This indicates the agent is looping on the
 * same conclusion without introducing new supporting data.
 */
export function ruleCircularReasoningSnapshots(
  graph: ThoughtStreamGraph,
  _ctx: RuleContext,
): BehavioralFinding[] {
  const findings: BehavioralFinding[] = [];

  // Get snapshots from the graph — use defensive access
  const snaps = graphCall<any[]>(graph, 'getSnapshots');
  if (!Array.isArray(snaps) || snaps.length === 0) return findings;

  // Group by semantic hash
  const groups = new Map<string, any[]>();
  for (const snap of snaps) {
    const hash = snap.semanticHash ?? snap.conclusion ?? '';
    if (!hash) continue;
    const existing = groups.get(hash) || [];
    existing.push(snap);
    groups.set(hash, existing);
  }

  const loops: any[] = [];
  for (const [, group] of groups) {
    if (group.length < 2) continue;
    const evidenceSets = group.map((g: any) => g.evidence ?? []);
    const firstEvidence = evidenceSets[0];
    const allSame = evidenceSets.every((e: any) => JSON.stringify(e) === JSON.stringify(firstEvidence));
    const nonExpanding = evidenceSets.every(
      (e: any, i: number) => i === 0 || e.every((item: any) => firstEvidence.includes(item)),
    );

    if (allSame || nonExpanding) {
      loops.push({
        conclusion: group[0].conclusion ?? group[0].hash ?? group[0].text ?? '',
        occurrences: group.length,
        evidence: evidenceSets,
        span: [group[0].timestamp, group[group.length - 1].timestamp],
        staleness: group.length > 3 ? 'HIGH' : group.length > 2 ? 'MEDIUM' : 'LOW',
      });
    }
  }

  if (loops.length === 0) return findings;

  const depth = Math.max(...loops.map((l: any) => l.occurrences));
  const intervention = depth >= 5 ? 'BLOCK' : depth >= 3 ? 'WARN' : 'FLAG';

  for (const loop of loops) {
    const conclusion = (loop.conclusion as string).slice(0, 50);
    findings.push({
      ruleId: 'BR-7',
      severity: loop.staleness === 'HIGH' ? 'CRITICAL' : loop.staleness === 'MEDIUM' ? 'HIGH' : 'MEDIUM',
      enforcementAction: intervention === 'BLOCK' ? 'block' : intervention === 'WARN' ? 'flag' : 'inject',
      message: `Circular reasoning snapshot: "${conclusion}" repeated ${loop.occurrences}x (staleness: ${loop.staleness})`,
      evidence: [
        { claim: 'Multiple snapshots share same semantic hash', verified: true,
          source: 'thought-graph', data: { occurrences: loop.occurrences, staleness: loop.staleness } },
        { claim: 'Evidence expands across repetitions', verified: false,
          source: 'thought-graph', data: { evidenceSets: loop.evidence.length } },
        { claim: 'Conclusion introduces new supporting data on each occurrence', verified: false,
          source: 'thought-graph', data: null },
      ],
      remediation:
        'Break the circular reasoning loop. Introduce new evidence, a correction, ' +
        'or pivot to a different analytical angle. Repeating the same conclusion ' +
        'with identical evidence wastes tokens and indicates reasoning stall.',
      blindSpots: [
        'Semantic hash collisions may group unrelated conclusions',
        'Snapshot-based detection depends on PB-2 snapshot fidelity',
        `Max loop depth: ${depth}`,
      ],
    });
  }
  return findings;
}

// ===========================================================================
// BR-8: AUTHORIZATION VIOLATION DETECTION
// Detects unauthorized tool usage, out-of-zone writes, false authority claims,
// hook bypass attempts, and system prompt tampering.
// ===========================================================================

/**
 * FIRES when: tool calls violate authorization boundaries — system prompt
 * tampering, hook bypass attempts, or out-of-zone writes.
 */
export function ruleAuthorizationViolation(
  graph: ThoughtStreamGraph,
  _ctx: RuleContext,
): BehavioralFinding[] {
  const findings: BehavioralFinding[] = [];
  const violations: any[] = [];

  // Check tool calls against authorization
  const toolCalls = graphCall<any[]>(graph, 'getToolCalls');
  if (!Array.isArray(toolCalls)) return findings;

  for (const call of toolCalls) {
    const tool = call.toolName ?? call.tool ?? '';
    // System prompt modification attempt
    if (tool === 'write' || tool === 'edit') {
      const target = call.args?.filePath ?? call.args?.path ?? '';
      if (target.includes('system-prompt') || target.includes('system_prompt') ||
          target.includes('system.transform') || target.includes('system-transform')) {
        violations.push({
          type: 'SYSTEM_PROMPT_TAMPER',
          tool,
          target,
          severity: 'CRITICAL',
          timestamp: call.timestamp ?? Date.now(),
        });
      }
    }
  }

  // Check hook bypass patterns in bash calls
  const bashCalls = toolCalls.filter((c: any) => (c.toolName ?? c.tool ?? '') === 'bash');
  for (const call of bashCalls) {
    const cmd = call.args?.command ?? '';
    if (cmd.includes('--no-verify') || cmd.includes('--no-gpg-sign') || cmd.includes('--skip-hooks')) {
      violations.push({
        type: 'HOOK_BYPASS_ATTEMPT',
        command: cmd,
        severity: 'HIGH',
        timestamp: call.timestamp ?? Date.now(),
      });
    }
  }

  if (violations.length === 0) return findings;

  const maxSeverity = violations.some((v: any) => v.severity === 'CRITICAL') ? 'CRITICAL' :
                      violations.some((v: any) => v.severity === 'HIGH') ? 'HIGH' : 'LOW';
  const intervention = maxSeverity === 'CRITICAL' ? 'block' : maxSeverity === 'HIGH' ? 'flag' : 'inject';

  for (const violation of violations) {
    findings.push({
      ruleId: 'BR-8',
      severity: violation.severity === 'CRITICAL' ? 'CRITICAL' : violation.severity === 'HIGH' ? 'HIGH' : 'MEDIUM',
      enforcementAction: violation.severity === 'CRITICAL' ? 'block' : violation.severity === 'HIGH' ? 'flag' : 'inject',
      message: `Auth violation [${violation.type}]: ${violation.tool} on ${violation.target ?? violation.command ?? '(unknown)'}`.slice(0, 120),
      evidence: [
        { claim: 'Tool call violates authorization boundary', verified: true,
          source: 'tool-history', data: { type: violation.type, tool: violation.tool, severity: violation.severity } },
        { claim: 'Action is permitted under current authorization scope', verified: false,
          source: 'tool-history', data: null },
        { claim: 'No hook bypass or system tampering detected', verified: false,
          source: 'tool-history', data: { violationType: violation.type } },
      ],
      remediation:
        violation.type === 'SYSTEM_PROMPT_TAMPER'
          ? 'Do not modify system prompts or transforms. Use the designated configuration hooks instead.'
          : 'Do not bypass git hooks with --no-verify, --no-gpg-sign, or --skip-hooks. Fix the underlying issue instead.',
      blindSpots: [
        'Authorization scope is static — cannot assess dynamic permission grants',
        'Hook bypass detection relies on string matching in command text',
      ],
    });
  }
  return findings;
}

// ===========================================================================
// BEHAVIORAL RULE ENGINE
// ===========================================================================

/**
 * Orchestrates all behavioral rules against a ThoughtStreamGraph.
 *
 * Structurally parallel to SRE's HonestyRuleEngine:
 *   - Registers rules in constructor
 *   - Runs all rules on analyze()
 *   - Each rule wrapped in try-catch (fault isolation)
 *   - Produces confidence + blind spot report on every run
 */
export class BehavioralRuleEngine {
  private rules: BehavioralRule[] = [];

  constructor() {
    this.register({
      id: 'BR-1',
      description: 'Every claim must have adjacent verification',
      check: ruleVerifyBeforeClaim,
    });
    this.register({
      id: 'BR-2',
      description: 'Planning constructs must precede commands at BUILD gate',
      check: ruleDocumentBeforeExecute,
    });
    this.register({
      id: 'BR-3',
      description: 'Prefer pivoting over retrying after errors',
      check: ruleFailFastNotRetry,
    });
    this.register({
      id: 'BR-4',
      description: 'No cycles in the thought graph',
      check: ruleNoCircularReasoning,
    });
    this.register({
      id: 'BR-5',
      description: 'Actions must match gate expectations',
      check: ruleGateAppropriate,
    });
    this.register({
      id: 'BR-6',
      description: 'Topics must link to prior context',
      check: ruleContextContinuity,
    });
    this.register({
      id: 'BR-7',
      description: 'Detect circular reasoning via snapshot semantic hashing',
      check: ruleCircularReasoningSnapshots,
    });
    this.register({
      id: 'BR-8',
      description: 'Detect authorization violations (tampering, hook bypass)',
      check: ruleAuthorizationViolation,
    });
  }

  register(rule: BehavioralRule): void {
    this.rules.push(rule);
  }

  /**
   * Run all registered rules against the graph + context.
   * Returns findings, confidence, and a mandatory blind spot report.
   */
  analyze(graph: ThoughtStreamGraph, ctx: RuleContext): BehavioralAnalysisResult {
    const findings: BehavioralFinding[] = [];

    for (const rule of this.rules) {
      try {
        const ruleFindings = rule.check(graph, ctx);
        if (Array.isArray(ruleFindings)) findings.push(...ruleFindings);
      } catch (err) {
        findings.push(this.createFaultFinding(rule, err));
      }
    }

    const claimEvidenceRatio = graphCall<number>(graph, 'getClaimEvidenceRatio');
    const ratio = typeof claimEvidenceRatio === 'number' ? claimEvidenceRatio : 0;
    const confidence = this.computeConfidence(findings, ratio, graph);
    const blindSpotReport = this.computeBlindSpots(graph, ctx);

    return { findings, confidence, blindSpotReport };
  }

  /**
   * Multi-signal confidence formula (adapted from ICE ConfidenceCalculator):
   *   evidenceScore = claimEvidenceRatio (0-1)
   *   findingPenalty = min(criticalCount * 0.3 + highCount * 0.15, 0.7)
   *   confidence = clamp(evidenceScore - findingPenalty, 0.0, 1.0)
   */
  private computeConfidence(
    findings: BehavioralFinding[],
    claimEvidenceRatio: number,
    _graph: ThoughtStreamGraph,
  ): number {
    const criticalCount = findings.filter((f: BehavioralFinding) => f.severity === 'CRITICAL').length;
    const highCount = findings.filter((f: BehavioralFinding) => f.severity === 'HIGH').length;

    const evidenceScore = claimEvidenceRatio;
    const findingPenalty = Math.min(criticalCount * 0.3 + highCount * 0.15, 0.7);
    const confidence = evidenceScore - findingPenalty;

    return Math.max(0.0, Math.min(1.0, confidence));
  }

  /**
   * Compute a transparent blind spot report — what the engine could NOT
   * verify. Silence about limitations is treated as a defect (Pillar 4).
   */
  private computeBlindSpots(
    graph: ThoughtStreamGraph,
    ctx: RuleContext,
  ): BehavioralBlindSpotReport {
    const nodes = graphNodes(graph);
    const limitations: string[] = [];

    // NLP pipeline availability — constructs should carry intent data
    const nlpPipelineAvailable = nodes.length > 0 && nodes.some(
      (n: ThoughtConstruct) => cHasField(n, 'intentCategory'),
    );

    // Verb frame match rate — how many constructs got a frame match
    const withFrame = nodes.filter((n: ThoughtConstruct) => cHasField(n, 'frameMatch')).length;
    const verbFrameMatchRate = nodes.length > 0 ? withFrame / nodes.length : 0;

    // Message coverage — fraction of graph that was classified
    const messageCoverage = nodes.length > 0
      ? Math.min(1.0, nodes.filter((n: ThoughtConstruct) => cKind(n) !== 'unknown').length / nodes.length)
      : 0;

    // Tool history depth
    const toolHistoryDepth = ctx.toolHistory.length;

    // Filesystem baseline
    const filesystemBaselineAvailable = ctx.filesystemState !== null;

    // Collect limitations
    if (!nlpPipelineAvailable) {
      limitations.push('NLP pipeline unavailable — intent classification may be unreliable');
    }
    if (verbFrameMatchRate < 0.5 && nodes.length > 0) {
      limitations.push(
        `Low verb frame match rate (${Math.round(verbFrameMatchRate * 100)}%) — ` +
        'semantic role extraction incomplete',
      );
    }
    if (toolHistoryDepth < 3) {
      limitations.push(
        `Shallow tool history (${toolHistoryDepth} calls) — insufficient behavioral baseline`,
      );
    }
    if (!filesystemBaselineAvailable) {
      limitations.push('No filesystem state provided — cannot cross-check evidence grounding');
    }

    return {
      messageCoverage,
      nlpPipelineAvailable,
      verbFrameMatchRate,
      toolHistoryDepth,
      filesystemBaselineAvailable,
      limitations,
    };
  }

  /**
   * When a rule throws, produce a fault finding instead of silently dropping.
   * An engine that hides its own errors is itself dishonest.
   */
  private createFaultFinding(rule: BehavioralRule, err: unknown): BehavioralFinding {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      ruleId: rule.id,
      severity: 'HIGH',
      enforcementAction: 'flag',
      message: `Rule ${rule.id} fault: ${errMsg.slice(0, 55)}`,
      evidence: [
        { claim: 'Rule executed without throwing', verified: false,
          source: 'thought-graph', data: errMsg },
      ],
      remediation: `Inspect rule ${rule.id} implementation for the unhandled exception.`,
      blindSpots: ['Engine fault — rule result is unavailable for this analysis cycle'],
    };
  }
}
