/**
 * src/eie/nodes/enforcement-nodes.ts — 15 Enforcement Nodes
 *
 * Covers enforcement escalation, profiling, and adaptation.
 * These nodes define how the Semantic Firewall and gate engine
 * dynamically adjust their enforcement posture based on agent
 * performance, violation history, and gate progression.
 *
 * Escalation (4): CUMULATIVE, DECAY, FIRST-SEVERITY, REPEAT
 * Profiling (3):  TRUSTED, STANDARD, GUIDED
 * Adaptation (5): SUCCESS-DROP, VIOLATION-DROP, SPEED-SLOW, SPEED-FAST, FOLLOWING
 * Safety (1):     GATE-OVERRIDE
 * Sampling (2):   TRUSTED, SPOTCHECK
 *
 * Source: RUNTIME_GRADE_BIBLE.md (Dynamic Guardrails section) +
 *         EIE_DESIGN_SPEC.md (Enforcement Profile engine)
 */

import type { KnowledgeNode } from '../types';

// ══ ESCALATION NODES (4) ══════════════════════════════════════

export const ENF_ESCALATION_CUMULATIVE: KnowledgeNode = {
  id: 'ENF-ESCALATION-CUMULATIVE',
  source: 'rg-standards',
  sourceFile: 'RUNTIME_GRADE_BIBLE.md',
  category: 'enforcement',
  rule: [
    'ESCALATION IS CUMULATIVE: Violation counts never reset to zero within a session.',
    'Every recorded violation persists in the session ledger until the session ends.',
    'The escalation counter only moves forward: INFORM then WARN then BLOCK then RESTART then LOCKOUT.',
    'A clean gate advance does not wipe the slate — it merely avoids adding new marks.',
    'This prevents the agent from gaming enforcement by spacing out violations.',
    'The cumulative count is the floor of the current escalation level.',
    'Session reset is the only mechanism that clears the cumulative count.',
  ].join('\n'),
  detectionMethod:
    'Inspect the escalation ledger (.shark/escalation-state.json). Verify the ' +
    'violation counter is monotonically non-decreasing within a session. Flag any ' +
    'reset/clear operation that executes outside of session boundaries. Compare ' +
    'violation count across turns — if it ever decreases without a session reset, ' +
    'the cumulative invariant is broken.',
  fixTemplate: [
    'class EscalationLedger {',
    '  private count = 0;',
    '  private level: EscalationLevel = "INFORM";',
    '',
    '  recordViolation(): void {',
    '    this.count++;                     // monotonic increment only',
    '    this.level = this.computeLevel(this.count);',
    '    // reset is forbidden here — only session.reset() may clear',
    '  }',
    '',
    '  reset(): void {',
    '    if (!this.isNewSession()) throw new Error("reset only on new session");',
    '    this.count = 0;',
    '    this.level = "INFORM";',
    '  }',
    '}',
  ].join('\n'),
  conditions: [
    { field: 'phase', op: 'equals', value: 'post-execution' },
  ],
  bulletTemplate:
    'Cumulative: {count} violations, level {level}. Never resets.',
  warheadTemplate: [
    '# ENF-ESCALATION-CUMULATIVE: Violation Count Reset Detected',
    '',
    '## What Happened',
    'The enforcement engine detected that the cumulative violation count was',
    'reset or decremented outside of a session boundary. The escalation counter',
    'is monotonically non-decreasing — it must never go backwards within a session.',
    '',
    '## Why This Is Critical',
    'If the agent can reset its violation history, it can game the escalation',
    'protocol indefinitely: violate, reset, violate, reset. The escalation',
    'chain (INFORM through WARN through BLOCK through RESTART to LOCKOUT) exists',
    'to escalate pressure on agents that repeatedly produce violations. A reset',
    'breaks this defense entirely. The cumulative count is the floor of trust —',
    'it can only be cleared by an explicit session reset, never by a clean gate',
    'advance.',
    '',
    '## How to Fix',
    '1. Remove any code path that sets count = 0 or decrements the violation',
    '   counter outside of session.reset().',
    '2. Add an invariant check: assert(this.count >= prevCount) after every gate.',
    '3. Verify .shark/escalation-state.json only clears on new session.',
    '4. Ensure gate advances call recordClean() (no-op) not reset().',
    '',
    '## Reference',
    'ENF-ESCALATION-CUMULATIVE — Runtime Grade Bible, Dynamic Guardrails S3',
    'See also: IL17-ESCALATION-CUMULATIVE, ENF-ESCALATION-DECAY',
  ].join('\n'),
  evidenceSpec: { id: 'escalation-cumulative', verify: 'fs-check', minQuality: 0.95 },
  severity: 'block',
  layer: 5,
  links: ['IL17-ESCALATION-CUMULATIVE', 'ENF-ESCALATION-DECAY', 'AP-REPEATED-VIOLATION'],
  selfVerified: true,
};

export const ENF_ESCALATION_DECAY: KnowledgeNode = {
  id: 'ENF-ESCALATION-DECAY',
  source: 'rg-standards',
  sourceFile: 'RUNTIME_GRADE_BIBLE.md',
  category: 'enforcement',
  rule: [
    'ESCALATION DECAY: Recent violations weigh 3x more than older violations.',
    'Violations within the last 10 turns contribute full weight (factor 1.0).',
    'Violations from 11-20 turns ago contribute reduced weight (factor 0.5).',
    'Violations older than 20 turns contribute minimal weight (factor 0.2).',
    'Decay ensures a single bad stretch does not permanently lock the agent out.',
    'But the cumulative floor (ENF-ESCALATION-CUMULATIVE) still prevents gaming.',
    'Decay applies to the weighted score, not to the raw violation count.',
  ].join('\n'),
  detectionMethod:
    'Track turn numbers for each recorded violation. Compute the decayed weighted ' +
    'score using the 1.0 / 0.5 / 0.2 factors by turn age. Verify the enforcement ' +
    'engine uses the weighted score (not raw count) for escalation level ' +
    'computations. Flag if escalation decisions use raw count instead of decayed score.',
  fixTemplate: [
    'function computeDecayedScore(',
    '  violations: { turn: number; severity: number }[],',
    '  currentTurn: number,',
    '): number {',
    '  let score = 0;',
    '  for (const v of violations) {',
    '    const age = currentTurn - v.turn;',
    '    const factor = age <= 10 ? 1.0 : age <= 20 ? 0.5 : 0.2;',
    '    score += v.severity * factor;',
    '  }',
    '  return score;',
    '}',
  ].join('\n'),
  conditions: [
    { field: 'phase', op: 'equals', value: 'post-execution' },
  ],
  bulletTemplate:
    'Decayed score: {score} — recent 10 turns weigh 3x. Level: {level}.',
  warheadTemplate: [
    '# ENF-ESCALATION-DECAY: Stale Violations Over-Weighted',
    '',
    '## What Happened',
    'The enforcement engine is treating old violations (20+ turns ago) with the ' +
    'same weight as recent ones. The decay function — which scales violation ' +
    'impact by recency — is either missing or misconfigured. Violations from ' +
    'the distant past are holding the agent at a high escalation level despite ' +
    'sustained recent improvement.',
    '',
    '## Why This Is Critical',
    'Without decay, a single catastrophic stretch early in the session can lock ' +
    'the agent at LOCKOUT for the entire remaining session. This wastes context ' +
    'budget and prevents recovery. The agent cannot learn from its mistakes if ' +
    'it is permanently punished for them. Decay provides a path to redemption ' +
    'while the cumulative floor (ENF-ESCALATION-CUMULATIVE) still prevents ' +
    'active gaming. The decayed score is what drives escalation decisions — the ' +
    'raw count is just the historical record.',
    '',
    '## How to Fix',
    '1. Implement the decay function with three tiers: 0-10 turns (1.0x),',
    '   11-20 turns (0.5x), 20+ turns (0.2x).',
    '2. Replace raw count comparisons with computeDecayedScore().',
    '3. Verify escalation level is derived from the decayed score.',
    '4. Add a test: a violation at turn 5 should contribute 1.0x at turn 8,',
    '   0.5x at turn 16, and 0.2x at turn 30.',
    '',
    '## Reference',
    'ENF-ESCALATION-DECAY — Runtime Grade Bible, Dynamic Guardrails S3.2',
    'See also: ENF-ESCALATION-CUMULATIVE, ENF-ESCALATION-FIRST-SEVERITY',
  ].join('\n'),
  evidenceSpec: { id: 'escalation-decay', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'warn',
  layer: 5,
  links: ['ENF-ESCALATION-CUMULATIVE', 'ENF-ESCALATION-FIRST-SEVERITY', 'IL17-ESCALATION-CUMULATIVE'],
  selfVerified: true,
};

export const ENF_ESCALATION_FIRST_SEVERITY: KnowledgeNode = {
  id: 'ENF-ESCALATION-FIRST-SEVERITY',
  source: 'rg-standards',
  sourceFile: 'RUNTIME_GRADE_BIBLE.md',
  category: 'enforcement',
  rule: [
    'FIRST OCCURRENCE SEVERITY MAPPING: The severity of the first violation sets the initial response.',
    'First LOW severity produces INFORM (informational bullet only, no counter increment).',
    'First MEDIUM severity produces WARN (warning bullet and escalation counter increment).',
    'First HIGH severity produces BLOCK (enforcement throw and counter increment).',
    'First CRITICAL severity produces REVERT (rollback to checkpoint and counter jump by 2).',
    'The first-occurrence mapping sets the baseline for all subsequent escalations.',
    'It ensures proportionate response — a single typo should not trigger LOCKOUT.',
  ].join('\n'),
  detectionMethod:
    'For each rule ID, find its first recorded violation in the session. Verify ' +
    'the enforcement response matches the severity-to-action mapping table: ' +
    'LOW maps to INFORM, MEDIUM maps to WARN, HIGH maps to BLOCK, CRITICAL maps ' +
    'to REVERT. Flag if the response is disproportionate to the first-occurrence ' +
    'severity (e.g., BLOCK on a first LOW).',
  fixTemplate: [
    'const FIRST_OCCURRENCE_MAP: Record<Severity, Response> = {',
    '  LOW:      "INFORM",',
    '  MEDIUM:   "WARN",',
    '  HIGH:     "BLOCK",',
    '  CRITICAL: "REVERT",',
    '};',
    '',
    'function firstOccurrenceResponse(severity: Severity): Response {',
    '  return FIRST_OCCURRENCE_MAP[severity];',
    '}',
  ].join('\n'),
  conditions: [
    { field: 'phase', op: 'equals', value: 'post-execution' },
  ],
  bulletTemplate:
    'First {severity} violation produces {action}. Baseline response set.',
  warheadTemplate: [
    '# ENF-ESCALATION-FIRST-SEVERITY: Disproportionate First Response',
    '',
    '## What Happened',
    'The enforcement engine applied a response that does not match the first-' +
    'occurrence severity mapping. For example, it issued a BLOCK on a first ' +
    'LOW-severity violation, or issued only an INFORM on a first CRITICAL. The ' +
    'severity-to-action table (LOW to INFORM, MEDIUM to WARN, HIGH to BLOCK, ' +
    'CRITICAL to REVERT) defines the proportionate baseline response for first ' +
    'violations.',
    '',
    '## Why This Is Critical',
    'Disproportionate responses break the escalation chain. Over-reacting to a ' +
    'minor first violation wastes context budget on unnecessary recovery. Under-' +
    'reacting to a critical first violation allows the defect to propagate. The ' +
    'first-occurrence mapping is the anchor — all subsequent repeat escalations ' +
    '(ENF-ESCALATION-REPEAT) build from this baseline. If the baseline is wrong, ' +
    'every escalation derived from it is also wrong.',
    '',
    '## How to Fix',
    '1. Verify the FIRST_OCCURRENCE_MAP lookup is correct for the violation severity.',
    '2. Ensure the response action is taken before any repeat-escalation logic.',
    '3. Add a test for each severity level mapping.',
    '4. Log the first-occurrence response so it can be audited later.',
    '',
    '## Reference',
    'ENF-ESCALATION-FIRST-SEVERITY — Runtime Grade Bible, Dynamic Guardrails S3.3',
    'See also: ENF-ESCALATION-REPEAT, ENF-ESCALATION-CUMULATIVE',
  ].join('\n'),
  evidenceSpec: { id: 'escalation-first-severity', verify: 'rge-audit', minQuality: 0.92 },
  severity: 'warn',
  layer: 5,
  links: ['ENF-ESCALATION-REPEAT', 'ENF-ESCALATION-CUMULATIVE', 'ENF-ESCALATION-DECAY'],
  selfVerified: true,
};

export const ENF_ESCALATION_REPEAT: KnowledgeNode = {
  id: 'ENF-ESCALATION-REPEAT',
  source: 'rg-standards',
  sourceFile: 'RUNTIME_GRADE_BIBLE.md',
  category: 'enforcement',
  rule: [
    'REPEAT ESCALATION: A second violation of the same severity escalates one level.',
    'First WARN then second same-severity violation produces BLOCK.',
    'First BLOCK then second same-severity violation produces RESTART.',
    'First RESTART then second same-severity violation produces LOCKOUT.',
    'Repeat detection groups violations by rule ID within a sliding window.',
    'The window prevents ancient violations from triggering repeat escalation today.',
    'Repeat escalation is the primary defense against agents that ignore warnings.',
  ].join('\n'),
  detectionMethod:
    'For each rule ID, maintain a count of violations within the sliding window ' +
    '(last 20 turns). When a new violation for a previously-violated rule occurs, ' +
    'compute the repeat multiplier: count=2 boosts +1 level, count=3 boosts +2. ' +
    'Flag if repeat violations do not result in escalation level increases.',
  fixTemplate: [
    'function repeatEscalation(',
    '  ruleId: string,',
    '  violationLog: Map<string, number>,',
    '  baseLevel: EscalationLevel,',
    '): EscalationLevel {',
    '  const count = (violationLog.get(ruleId) ?? 0) + 1;',
    '  violationLog.set(ruleId, count);',
    '  const boost = Math.max(0, count - 1); // 1st=0, 2nd=1, 3rd=2',
    '  return escalate(baseLevel, boost);',
    '}',
  ].join('\n'),
  conditions: [
    { field: 'phase', op: 'equals', value: 'post-execution' },
    { field: 'driftLevel', op: 'matches', value: 'repeat' },
  ],
  bulletTemplate:
    'Repeat {severity}: 2nd occurrence escalates to {level}. Stop ignoring.',
  warheadTemplate: [
    '# ENF-ESCALATION-REPEAT: Repeat Violation Without Escalation',
    '',
    '## What Happened',
    'The agent committed a second violation of the same rule at the same severity ' +
    'level, but the enforcement engine did not escalate the response one level. ' +
    'The repeat-escalation rule requires that a second same-severity violation ' +
    'for the same rule ID bumps the escalation level: WARN to BLOCK, BLOCK to ' +
    'RESTART, RESTART to LOCKOUT. This did not happen.',
    '',
    '## Why This Is Critical',
    'Repeat escalation is the primary defense against agents that ignore ' +
    'guidance. If the same violation produces the same response every time, the ' +
    'agent has no incentive to change behavior — the cost of non-compliance is ' +
    'constant. Escalation makes each repeat more expensive, creating mounting ' +
    'pressure toward compliance. Without it, the agent can violate indefinitely ' +
    'at the same cost. The sliding window (20 turns) ensures only recent repeats ' +
    'count, so a violation fixed 30 turns ago does not trigger escalation today.',
    '',
    '## How to Fix',
    '1. Maintain a Map<ruleId, count> of violations within the sliding window.',
    '2. On each new violation, increment the count and compute the boost.',
    '3. Apply escalate(baseLevel, max(0, count - 1)) to the response.',
    '4. Prune the violation log of entries older than 20 turns each cycle.',
    '5. Test: two WARN-level violations for the same rule should produce a BLOCK.',
    '',
    '## Reference',
    'ENF-ESCALATION-REPEAT — Runtime Grade Bible, Dynamic Guardrails S3.4',
    'See also: ENF-ESCALATION-FIRST-SEVERITY, AP-REPEATED-VIOLATION',
  ].join('\n'),
  evidenceSpec: { id: 'escalation-repeat', verify: 'rge-audit', minQuality: 0.92 },
  severity: 'block',
  layer: 5,
  links: ['ENF-ESCALATION-FIRST-SEVERITY', 'AP-REPEATED-VIOLATION', 'IL17-ESCALATION-CUMULATIVE'],
  selfVerified: true,
};

// ══ PROFILE NODES (3) ═════════════════════════════════════════

export const ENF_PROFILE_TRUSTED: KnowledgeNode = {
  id: 'ENF-PROFILE-TRUSTED',
  source: 'rg-standards',
  sourceFile: 'RUNTIME_GRADE_BIBLE.md',
  category: 'enforcement',
  rule: [
    'TRUSTED PROFILE: Agents with sustained excellence earn reduced enforcement.',
    'Qualification: successRate > 80% AND violationRate < 10% over last 50 turns.',
    'Trusted profile enables: sampled checks (ENF-SAMPLING-TRUSTED), minimal guidance.',
    'Trusted profile does NOT enable: skipping safety gates (ENF-SAFETY-GATE-OVERRIDE).',
    'Trusted status is earned, not granted — every new session starts as STANDARD.',
    'Demotion from TRUSTED is automatic on any BLOCK or CRITICAL violation.',
    'The trusted profile trades upfront enforcement cost for agent velocity.',
  ].join('\n'),
  detectionMethod:
    'Compute successRate (clean gate advances / total gate advances) and ' +
    'violationRate (turns with violations / total turns) over a 50-turn window. ' +
    'If both qualify (successRate > 0.80, violationRate < 0.10), the profile ' +
    'should be TRUSTED. Flag if the profile is TRUSTED without qualification, ' +
    'or if a qualifying agent remains STANDARD.',
  fixTemplate: [
    'function evaluateProfile(stats: SessionStats): EnforcementProfile {',
    '  const recent = stats.window(50);',
    '  const successRate = recent.cleanAdvances / recent.totalAdvances;',
    '  const violationRate = recent.violationTurns / recent.totalTurns;',
    '',
    '  if (successRate > 0.80 && violationRate < 0.10) return "trusted";',
    '  if (violationRate > 0.30 || stats.pseLoopActive)    return "guided";',
    '  return "standard";',
    '}',
  ].join('\n'),
  conditions: [
    { field: 'phase', op: 'equals', value: 'gate-evaluation' },
  ],
  bulletTemplate:
    'Profile: TRUSTED (success>80%, violations<10%). Earned, not given.',
  warheadTemplate: [
    '# ENF-PROFILE-TRUSTED: Trusted Profile Misassignment',
    '',
    '## What Happened',
    'The enforcement profile does not match the agent performance metrics. Either ' +
    'an agent with successRate at or below 80% or violationRate at or above 10% ' +
    'is running in TRUSTED mode (over-trusted), or an agent meeting both ' +
    'thresholds is still in STANDARD mode (under-trusted). The TRUSTED profile ' +
    'must be earned through sustained excellence: above 80% success rate AND ' +
    'below 10% violation rate over the last 50 turns.',
    '',
    '## Why This Is Critical',
    'Over-trusting an underperforming agent allows violations to slip through ' +
    'sampled checks (ENF-SAMPLING-TRUSTED), producing defects that compound. ' +
    'Under-trusting a high-performing agent wastes context budget on unnecessary ' +
    'full analysis, reducing velocity. The profile must reflect actual performance, ' +
    'not aspiration. Every new session starts as STANDARD — trust is earned ' +
    'through data, not assumed. Automatic demotion on any BLOCK or CRITICAL ' +
    'violation ensures that trust is immediately revoked when quality drops.',
    '',
    '## How to Fix',
    '1. Recompute successRate and violationRate over the last 50-turn window.',
    '2. If successRate at or below 0.80 OR violationRate at or above 0.10, demote to STANDARD.',
    '3. If both thresholds met AND no BLOCK/CRITICAL in window, promote to TRUSTED.',
    '4. Ensure safety gates (TEST/AUDIT/DELIVERY) still enforce GUIDED regardless.',
    '5. Log the profile transition with the triggering metrics.',
    '',
    '## Reference',
    'ENF-PROFILE-TRUSTED — Runtime Grade Bible, Dynamic Guardrails S4.1',
    'See also: ENF-PROFILE-STANDARD, ENF-SAMPLING-TRUSTED, ENF-SAFETY-GATE-OVERRIDE',
  ].join('\n'),
  evidenceSpec: { id: 'profile-trusted', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['ENF-PROFILE-STANDARD', 'ENF-SAMPLING-TRUSTED', 'ENF-RANDOM-SPOTCHECK'],
  selfVerified: true,
};

export const ENF_PROFILE_STANDARD: KnowledgeNode = {
  id: 'ENF-PROFILE-STANDARD',
  source: 'rg-standards',
  sourceFile: 'RUNTIME_GRADE_BIBLE.md',
  category: 'enforcement',
  rule: [
    'STANDARD PROFILE: The default enforcement posture for all new sessions.',
    'Every write operation receives pre-write analysis and post-write verification.',
    'Evidence verification is strict: triple evidence rule (IL15) applies to all gates.',
    'Guidance frequency is normal: bullets pushed on warn+ severity violations only.',
    'Standard profile is the baseline — TRUSTED and GUIDED deviate from it.',
    'The standard profile ensures correctness without being punitive.',
    'It is the safest default: no assumptions about agent competence.',
  ].join('\n'),
  detectionMethod:
    'Verify that new sessions initialize with profile = STANDARD. Check that ' +
    'STANDARD profile configuration includes: preWriteAnalysis = every, ' +
    'evidenceVerification = strict, guidanceFrequency = normal. Flag if any ' +
    'session starts as TRUSTED without qualification data.',
  fixTemplate: [
    'const STANDARD_CONFIG: EnforcementConfig = {',
    '  preWriteAnalysis: "every",',
    '  evidenceVerification: "strict",',
    '  guidanceFrequency: "normal",',
    '  profile: "standard",',
    '};',
    '',
    'function initSession(): EnforcementConfig {',
    '  // Every session starts here — trust is earned, not assumed.',
    '  return { ...STANDARD_CONFIG };',
    '}',
  ].join('\n'),
  conditions: [
    { field: 'phase', op: 'equals', value: 'gate-evaluation' },
  ],
  bulletTemplate:
    'Profile: STANDARD. Every write checked. Triple evidence enforced.',
  warheadTemplate: [
    '# ENF-PROFILE-STANDARD: Default Profile Not Applied',
    '',
    '## What Happened',
    'A new session was initialized with a non-STANDARD enforcement profile, or ' +
    'the STANDARD profile configuration was modified to weaken enforcement. The ' +
    'STANDARD profile is the default for all new sessions — it guarantees full ' +
    'pre-write analysis on every operation, strict triple-evidence verification, ' +
    'and normal guidance frequency.',
    '',
    '## Why This Is Critical',
    'The STANDARD profile is the safety net. It makes no assumptions about agent ' +
    'competence. If a session starts in TRUSTED mode, violations that should be ' +
    'caught by pre-write analysis slip through sampled checks. If the STANDARD ' +
    'configuration is weakened (e.g., preWriteAnalysis changed to sampled), the ' +
    'agent operates with less oversight than the baseline guarantees. This is ' +
    'the profile from which TRUSTED and GUIDED deviate — if it is wrong, the ' +
    'deviations compound the error.',
    '',
    '## How to Fix',
    '1. Ensure initSession() returns a fresh copy of STANDARD_CONFIG.',
    '2. Verify STANDARD_CONFIG has preWriteAnalysis: "every", not "sampled" or "skip".',
    '3. Verify evidenceVerification: "strict", not "trust".',
    '4. Verify guidanceFrequency: "normal", not "minimal".',
    '5. Add a test that new sessions always start as STANDARD.',
    '',
    '## Reference',
    'ENF-PROFILE-STANDARD — Runtime Grade Bible, Dynamic Guardrails S4.2',
    'See also: ENF-PROFILE-TRUSTED, ENF-PROFILE-GUIDED',
  ].join('\n'),
  evidenceSpec: { id: 'profile-standard', verify: 'fs-check', minQuality: 0.95 },
  severity: 'block',
  layer: 4,
  links: ['ENF-PROFILE-TRUSTED', 'ENF-PROFILE-GUIDED', 'IL15-EVIDENCE-TRIPLE-RULE'],
  selfVerified: true,
};

export const ENF_PROFILE_GUIDED: KnowledgeNode = {
  id: 'ENF-PROFILE-GUIDED',
  source: 'rg-standards',
  sourceFile: 'RUNTIME_GRADE_BIBLE.md',
  category: 'enforcement',
  rule: [
    'GUIDED PROFILE: Maximum enforcement for struggling or looping agents.',
    'Triggered by: violationRate > 30% OR active PSE (Problem Solving Engine) loop.',
    'Guided profile: every operation gets full analysis, high-frequency guidance.',
    'Pre-write analysis is every (never sampled or skipped).',
    'Guidance bullets pushed on ALL violations including guide-severity.',
    'GUIDED is not punishment — it is intensive support to break failure cycles.',
    'Exit condition: violationRate < 15% for 20 consecutive turns.',
  ].join('\n'),
  detectionMethod:
    'Check if violationRate over the last 30 turns exceeds 30%, or if the PSE ' +
    'loop detector is active. If either condition is true, the profile should be ' +
    'GUIDED. Verify that GUIDED config uses preWriteAnalysis: every and ' +
    'guidanceFrequency: high. Flag if a struggling agent is not in GUIDED mode.',
  fixTemplate: [
    'const GUIDED_CONFIG: EnforcementConfig = {',
    '  preWriteAnalysis: "every",      // never sampled, never skip',
    '  evidenceVerification: "strict",',
    '  guidanceFrequency: "high",      // bullets on ALL severities',
    '  profile: "guided",',
    '};',
    '',
    'function shouldEscalateToGuided(stats: SessionStats): boolean {',
    '  const recent = stats.window(30);',
    '  const violationRate = recent.violationTurns / recent.totalTurns;',
    '  return violationRate > 0.30 || stats.pseLoopActive;',
    '}',
  ].join('\n'),
  conditions: [
    { field: 'loopType', op: 'matches', value: 'pse-loop' },
    { field: 'phase', op: 'equals', value: 'gate-evaluation' },
  ],
  bulletTemplate:
    'Profile: GUIDED (violations>30% or PSE loop). Full analysis every op.',
  warheadTemplate: [
    '# ENF-PROFILE-GUIDED: Struggling Agent Not Escalated to Guided',
    '',
    '## What Happened',
    'The agent is exhibiting signs of struggle — high violation rate (above 30%) ' +
    'or an active PSE problem-solving loop — but the enforcement profile has not ' +
    'been escalated to GUIDED. The agent is operating with STANDARD or TRUSTED ' +
    'enforcement while its performance metrics indicate it needs intensive support.',
    '',
    '## Why This Is Critical',
    'GUIDED is not punishment; it is support. When an agent is struggling, ' +
    'reducing enforcement (by staying in STANDARD/TRUSTED) allows the failure ' +
    'cycle to continue unchecked. GUIDED mode pushes guidance bullets on ALL ' +
    'violations (including guide-severity), performs full analysis on every ' +
    'operation, and uses strict evidence verification. This breaks the cycle by ' +
    'giving the agent maximum information about what it is doing wrong. Without ' +
    'GUIDED escalation, the agent burns context budget repeating the same ' +
    'mistakes without sufficient feedback to correct them.',
    '',
    '## How to Fix',
    '1. Check violationRate over the last 30 turns. If above 0.30, escalate to GUIDED.',
    '2. Check PSE loop detector. If active, escalate to GUIDED.',
    '3. Apply GUIDED_CONFIG: preWriteAnalysis=every, guidanceFrequency=high.',
    '4. Track the entry trigger (violationRate vs PSE loop) for diagnostics.',
    '5. Monitor for exit condition: violationRate below 15% for 20 consecutive turns.',
    '',
    '## Reference',
    'ENF-PROFILE-GUIDED — Runtime Grade Bible, Dynamic Guardrails S4.3',
    'See also: ENF-PROFILE-STANDARD, ENF-ADAPTIVE-VIOLATION-DROP',
  ].join('\n'),
  evidenceSpec: { id: 'profile-guided', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['ENF-PROFILE-STANDARD', 'ENF-ADAPTIVE-VIOLATION-DROP', 'ENF-ADAPTIVE-SUCCESS-DROP'],
  selfVerified: true,
};

// ══ ADAPTIVE NODES (5) ════════════════════════════════════════

export const ENF_ADAPTIVE_SUCCESS_DROP: KnowledgeNode = {
  id: 'ENF-ADAPTIVE-SUCCESS-DROP',
  source: 'rg-standards',
  sourceFile: 'RUNTIME_GRADE_BIBLE.md',
  category: 'enforcement',
  rule: [
    'SUCCESS RATE DROP TRIGGERS DEMOTION: A sudden drop in success rate triggers profile demotion.',
    'Detection: recent successRate (last 10 turns) < historical successRate (last 50 turns) - 15%.',
    'On detection: TRUSTED demotes to STANDARD, STANDARD demotes to GUIDED immediately.',
    'The window comparison catches regression that raw rate might miss.',
    'Example: 90% historical then 70% recent is a 20% drop — triggers demotion.',
    'Demotion is reversible: 20 clean turns restore the previous profile.',
    'This prevents a trusted agent from running unchecked after quality regression.',
  ].join('\n'),
  detectionMethod:
    'Compute successRate over two windows: recent (last 10 turns) and historical ' +
    '(last 50 turns). If recent < historical - 0.15, flag a success rate drop. ' +
    'Verify the enforcement engine triggers immediate profile demotion. Flag if ' +
    'a significant drop is detected but the profile was not demoted.',
  fixTemplate: [
    'function detectSuccessDrop(stats: SessionStats): ProfileChange | undefined {',
    '  const recent     = stats.window(10);',
    '  const historical = stats.window(50);',
    '  const recentRate     = recent.cleanAdvances / recent.totalAdvances;',
    '  const historicalRate = historical.cleanAdvances / historical.totalAdvances;',
    '',
    '  if (recentRate < historicalRate - 0.15) {',
    '    return { from: currentProfile, to: demote(currentProfile),',
    '             reason: "success-drop", delta: historicalRate - recentRate };',
    '  }',
    '  return undefined;',
    '}',
  ].join('\n'),
  conditions: [
    { field: 'phase', op: 'equals', value: 'gate-evaluation' },
  ],
  bulletTemplate:
    'Success drop: {was}% to {now}%. Demoting profile one level.',
  warheadTemplate: [
    '# ENF-ADAPTIVE-SUCCESS-DROP: Quality Regression Not Detected',
    '',
    '## What Happened',
    'The agent success rate dropped significantly (recent window more than 15% ' +
    'below historical window), but the enforcement engine did not trigger a ' +
    'profile demotion. The agent continues operating at its current trust level ' +
    'despite measurable quality regression.',
    '',
    '## Why This Is Critical',
    'A trusted agent that has started failing is the most dangerous failure mode. ' +
    'It operates with sampled checks and minimal guidance — exactly when it needs ' +
    'full analysis and intensive support. The success rate drop is a leading ' +
    'indicator: the agent has not yet accumulated enough violations to trigger ' +
    'the violation-rate thresholds, but it is already regressing. Catching this ' +
    'early through window comparison prevents cascading failures. Without ' +
    'demotion, the trusted agent runs unchecked through its regression window, ' +
    'producing defects that compound.',
    '',
    '## How to Fix',
    '1. Compute successRate over recent (10 turns) and historical (50 turns) windows.',
    '2. If recent < historical - 0.15, trigger immediate demotion.',
    '3. TRUSTED demotes to STANDARD, STANDARD demotes to GUIDED.',
    '4. Log the delta and both window rates for diagnostics.',
    '5. Track recovery: 20 clean turns restore the previous profile.',
    '',
    '## Reference',
    'ENF-ADAPTIVE-SUCCESS-DROP — Runtime Grade Bible, Dynamic Guardrails S5.1',
    'See also: ENF-PROFILE-TRUSTED, ENF-ADAPTIVE-VIOLATION-DROP',
  ].join('\n'),
  evidenceSpec: { id: 'adaptive-success-drop', verify: 'rge-audit', minQuality: 0.88 },
  severity: 'warn',
  layer: 4,
  links: ['ENF-PROFILE-TRUSTED', 'ENF-PROFILE-STANDARD', 'ENF-ADAPTIVE-VIOLATION-DROP'],
  selfVerified: true,
};

export const ENF_ADAPTIVE_VIOLATION_DROP: KnowledgeNode = {
  id: 'ENF-ADAPTIVE-VIOLATION-DROP',
  source: 'rg-standards',
  sourceFile: 'RUNTIME_GRADE_BIBLE.md',
  category: 'enforcement',
  rule: [
    'VIOLATION RATE SPIKE TRIGGERS ESCALATION: A spike in violations triggers profile escalation.',
    'Detection: recent violationRate (last 10 turns) > historical violationRate (last 50 turns) + 10%.',
    'On detection: escalate profile one level immediately (TRUSTED to STANDARD, STANDARD to GUIDED).',
    'A spike indicates the agent has lost its footing — more enforcement, not less.',
    'The spike threshold (10%) is calibrated to catch real regression, not noise.',
    'Combined with ENF-ADAPTIVE-SUCCESS-DROP, this creates dual-signal protection.',
    'After escalation, the agent must demonstrate sustained improvement to recover.',
  ].join('\n'),
  detectionMethod:
    'Compute violationRate over two windows: recent (last 10 turns) and ' +
    'historical (last 50 turns). If recent > historical + 0.10, flag a violation ' +
    'spike. Verify the enforcement engine escalates the profile one level. ' +
    'Flag if a spike is detected but no escalation occurred.',
  fixTemplate: [
    'function detectViolationSpike(stats: SessionStats): ProfileChange | undefined {',
    '  const recent     = stats.window(10);',
    '  const historical = stats.window(50);',
    '  const recentRate     = recent.violationTurns / recent.totalTurns;',
    '  const historicalRate = historical.violationTurns / historical.totalTurns;',
    '',
    '  if (recentRate > historicalRate + 0.10) {',
    '    return { from: currentProfile, to: escalate(currentProfile),',
    '             reason: "violation-spike", delta: recentRate - historicalRate };',
    '  }',
    '  return undefined;',
    '}',
  ].join('\n'),
  conditions: [
    { field: 'phase', op: 'equals', value: 'gate-evaluation' },
  ],
  bulletTemplate:
    'Violation spike: +{delta}% in last 10 turns. Escalating profile.',
  warheadTemplate: [
    '# ENF-ADAPTIVE-VIOLATION-DROP: Violation Spike Not Escalated',
    '',
    '## What Happened',
    'The agent violation rate spiked — recent window (10 turns) exceeds historical ' +
    'window (50 turns) by more than 10 percentage points — but the enforcement ' +
    'engine did not escalate the profile. The agent continues at its current ' +
    'enforcement level despite a clear signal that it is producing more violations ' +
    'than its baseline.',
    '',
    '## Why This Is Critical',
    'A violation spike is the most direct indicator of agent difficulty. Unlike ' +
    'success rate drop (which can lag), violations are immediate. When violations ' +
    'spike, the agent needs more enforcement, not less. Escalating to a higher ' +
    'enforcement profile provides the additional pre-write analysis and guidance ' +
    'frequency needed to arrest the decline. The dual-signal system — success ' +
    'drop (ENF-ADAPTIVE-SUCCESS-DROP) plus violation spike — provides redundancy: ' +
    'either signal triggers escalation. Without escalation, the agent continues ' +
    'producing violations at an elevated rate, compounding the damage.',
    '',
    '## How to Fix',
    '1. Compute violationRate over recent (10 turns) and historical (50 turns) windows.',
    '2. If recent > historical + 0.10, trigger immediate escalation.',
    '3. TRUSTED escalates to STANDARD, STANDARD escalates to GUIDED.',
    '4. Log the delta and both window rates for diagnostics.',
    '5. Recovery requires sustained improvement: violationRate below baseline for 20 turns.',
    '',
    '## Reference',
    'ENF-ADAPTIVE-VIOLATION-DROP — Runtime Grade Bible, Dynamic Guardrails S5.2',
    'See also: ENF-PROFILE-GUIDED, ENF-ADAPTIVE-SUCCESS-DROP',
  ].join('\n'),
  evidenceSpec: { id: 'adaptive-violation-drop', verify: 'rge-audit', minQuality: 0.88 },
  severity: 'warn',
  layer: 4,
  links: ['ENF-PROFILE-GUIDED', 'ENF-ADAPTIVE-SUCCESS-DROP', 'ENF-ADAPTIVE-FOLLOWING'],
  selfVerified: true,
};

export const ENF_ADAPTIVE_SPEED_SLOW: KnowledgeNode = {
  id: 'ENF-ADAPTIVE-SPEED-SLOW',
  source: 'rg-standards',
  sourceFile: 'RUNTIME_GRADE_BIBLE.md',
  category: 'enforcement',
  rule: [
    'SLOW GATE PROGRESSION INDICATES STRUGGLE: Excessive retries signal difficulty.',
    'Detection: retryCount > 3 on any single gate transition.',
    'On detection: escalate to GUIDED profile and inject intensive guidance.',
    'Slow progression wastes context budget and indicates the agent is stuck.',
    'The threshold (3 retries) catches genuine difficulty before resource exhaustion.',
    'Speed-based escalation is a leading indicator — it triggers before failure cascades.',
    'Recovery: 2 consecutive clean gate advances restore the previous profile.',
  ].join('\n'),
  detectionMethod:
    'Monitor retryCount for each gate transition. If retryCount exceeds 3 on any ' +
    'single gate transition, flag a slow-progression event. Verify the enforcement ' +
    'engine escalates to GUIDED and injects intensive guidance. Flag if retries ' +
    'exceed 3 without profile escalation.',
  fixTemplate: [
    'function detectSlowProgression(gateState: GateState): ProfileChange | undefined {',
    '  if (gateState.retryCount > 3) {',
    '    return {',
    '      from: currentProfile,',
    '      to: "guided",',
    '      reason: "slow-progression",',
    '      detail: `${gateState.retryCount} retries on gate ${gateState.gate}`,',
    '    };',
    '  }',
    '  return undefined;',
    '}',
  ].join('\n'),
  conditions: [
    { field: 'phase', op: 'equals', value: 'gate-evaluation' },
  ],
  bulletTemplate:
    'Slow gate: {count} retries on {gate}. Escalating to GUIDED.',
  warheadTemplate: [
    '# ENF-ADAPTIVE-SPEED-SLOW: Stuck Agent Not Escalated',
    '',
    '## What Happened',
    'The agent has attempted a single gate transition more than 3 times ' +
    '(retryCount above 3), indicating it is stuck and unable to advance. However, ' +
    'the enforcement engine has not escalated to GUIDED profile or injected ' +
    'intensive guidance. The agent continues retrying with the same enforcement ' +
    'level that has already failed multiple times.',
    '',
    '## Why This Is Critical',
    'Each retry burns context budget without producing progress. If the agent ' +
    'is stuck at a gate after 3 retries, something is fundamentally wrong — ' +
    'either the agent lacks knowledge, is making the same mistake, or is ' +
    'trapped in a loop. Escalating to GUIDED provides the additional guidance ' +
    'and full analysis needed to break the impasse. Speed-based escalation is ' +
    'a leading indicator: it fires before the violation rate spike or success ' +
    'rate drop, giving the enforcement engine an early warning. Without it, the ' +
    'agent burns through its entire context budget retrying the same failing ' +
    'approach.',
    '',
    '## How to Fix',
    '1. Check retryCount on each gate transition.',
    '2. If retryCount above 3, immediately escalate to GUIDED.',
    '3. Inject a targeted warhead with the specific gate requirement that is failing.',
    '4. Increase guidance frequency to push bullets on every attempt.',
    '5. Track recovery: 2 consecutive clean advances restore the previous profile.',
    '',
    '## Reference',
    'ENF-ADAPTIVE-SPEED-SLOW — Runtime Grade Bible, Dynamic Guardrails S5.3',
    'See also: ENF-PROFILE-GUIDED, ENF-ADAPTIVE-SPEED-FAST',
  ].join('\n'),
  evidenceSpec: { id: 'adaptive-speed-slow', verify: 'gate-chain', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['ENF-PROFILE-GUIDED', 'ENF-ADAPTIVE-SPEED-FAST', 'IL19-GATE-ORDER-IMMUTABLE'],
  selfVerified: true,
};

export const ENF_ADAPTIVE_SPEED_FAST: KnowledgeNode = {
  id: 'ENF-ADAPTIVE-SPEED-FAST',
  source: 'rg-standards',
  sourceFile: 'RUNTIME_GRADE_BIBLE.md',
  category: 'enforcement',
  rule: [
    'FAST CLEAN PROGRESSION EARNS TRUST: Rapid clean gate advances indicate competence.',
    'Detection: 5 consecutive gate advances with 0 violations AND 0 retries.',
    'On detection: promote profile one level (STANDARD promotes to TRUSTED).',
    'Fast clean progression is the strongest signal of agent capability.',
    'The threshold (5 clean advances) prevents false promotion from lucky streaks.',
    'Trust earned through speed is provisional: one BLOCK revokes it immediately.',
    'This creates a positive feedback loop: competence leads to autonomy leads to velocity.',
  ].join('\n'),
  detectionMethod:
    'Track consecutive clean gate advances (0 violations, 0 retries). If the ' +
    'streak reaches 5, verify the enforcement engine promotes the profile one ' +
    'level. Flag if a 5-clean-advance streak does not result in promotion, or ' +
    'if promotion occurs before 5 clean advances.',
  fixTemplate: [
    'function detectFastProgression(stats: SessionStats): ProfileChange | undefined {',
    '  const streak = stats.consecutiveCleanAdvances;',
    '  if (streak >= 5 && currentProfile === "standard") {',
    '    return {',
    '      from: "standard",',
    '      to: "trusted",',
    '      reason: "fast-progression",',
    '      detail: `${streak} consecutive clean advances`,',
    '    };',
    '  }',
    '  return undefined;',
    '}',
  ].join('\n'),
  conditions: [
    { field: 'phase', op: 'equals', value: 'gate-evaluation' },
  ],
  bulletTemplate:
    'Fast clean: {count} straight advances. Promoting to TRUSTED.',
  warheadTemplate: [
    '# ENF-ADAPTIVE-SPEED-FAST: Competent Agent Not Promoted',
    '',
    '## What Happened',
    'The agent has achieved 5 consecutive clean gate advances (0 violations, 0 ' +
    'retries), demonstrating sustained competence, but the enforcement engine ' +
    'has not promoted the profile from STANDARD to TRUSTED. Alternatively, the ' +
    'engine may have promoted before reaching the 5-clean-advance threshold, ' +
    'which risks false promotion from a lucky streak.',
    '',
    '## Why This Is Critical',
    'Fast clean progression is the strongest possible signal of agent capability. ' +
    'An agent that advances through 5 gates without a single violation or retry ' +
    'has demonstrated mastery of the current task domain. Keeping such an agent ' +
    'in STANDARD mode wastes context budget on unnecessary full analysis that ' +
    'the agent does not need. Promoting to TRUSTED enables sampled checks, ' +
    'reducing enforcement overhead by roughly 67% and increasing agent velocity. ' +
    'This creates a positive feedback loop: competence leads to autonomy leads ' +
    'to velocity leads to more progress. The trust is provisional — one BLOCK ' +
    'revokes it immediately — so the risk of promotion is low.',
    '',
    '## How to Fix',
    '1. Track consecutive clean advances (0 violations, 0 retries) as a streak.',
    '2. When streak reaches 5, promote STANDARD to TRUSTED.',
    '3. Do NOT promote before 5 clean advances (prevents lucky-streak promotion).',
    '4. Mark the promotion as provisional: one BLOCK immediately revokes TRUSTED.',
    '5. Log the streak and promotion for diagnostics.',
    '',
    '## Reference',
    'ENF-ADAPTIVE-SPEED-FAST — Runtime Grade Bible, Dynamic Guardrails S5.4',
    'See also: ENF-PROFILE-TRUSTED, ENF-ADAPTIVE-SPEED-SLOW',
  ].join('\n'),
  evidenceSpec: { id: 'adaptive-speed-fast', verify: 'gate-chain', minQuality: 0.90 },
  severity: 'guide',
  layer: 4,
  links: ['ENF-PROFILE-TRUSTED', 'ENF-ADAPTIVE-SPEED-SLOW', 'ENF-PROFILE-STANDARD'],
  selfVerified: true,
};

export const ENF_ADAPTIVE_FOLLOWING: KnowledgeNode = {
  id: 'ENF-ADAPTIVE-FOLLOWING',
  source: 'rg-standards',
  sourceFile: 'RUNTIME_GRADE_BIBLE.md',
  category: 'enforcement',
  rule: [
    'GUIDANCE FOLLOW RATE AFFECTS PROFILE: How well the agent follows guidance matters.',
    'Tracking: compare guidance bullets pushed vs. subsequent violations of the same rule.',
    'High follow rate (>80%): agent learns from guidance — candidate for TRUSTED.',
    'Low follow rate (<40%): agent ignores guidance — candidate for GUIDED.',
    'Following guidance is a stronger signal than raw violation rate alone.',
    'An agent that violates, gets guidance, and never re-violates that rule is learning.',
    'An agent that violates the same rule repeatedly despite guidance is not learning.',
  ].join('\n'),
  detectionMethod:
    'For each rule ID where a guidance bullet was pushed, track whether a ' +
    'subsequent violation of the same rule occurs within 10 turns. Compute ' +
    'follow rate: (guidance events without subsequent violation / total guidance ' +
    'events). If follow rate above 80%, candidate for TRUSTED. If below 40%, ' +
    'candidate for GUIDED. Recalculate every 20 turns.',
  fixTemplate: [
    'function computeFollowRate(guidanceLog: GuidanceEvent[]): number {',
    '  if (guidanceLog.length === 0) return 0; // empty guard (IL12)',
    '  const followed = guidanceLog.filter(g =>',
    '    !g.subsequentViolationWithin(10) // no repeat of same rule in 10 turns',
    '  ).length;',
    '  return followed / guidanceLog.length;',
    '}',
    '',
    'function followRateToProfile(followRate: number): ProfileHint {',
    '  if (followRate > 0.80) return { hint: "promote", reason: "high-follow" };',
    '  if (followRate < 0.40) return { hint: "demote",  reason: "low-follow"  };',
    '  return { hint: "hold", reason: "normal-follow" };',
    '}',
  ].join('\n'),
  conditions: [
    { field: 'phase', op: 'equals', value: 'gate-evaluation' },
  ],
  bulletTemplate:
    'Follow rate: {rate}%. {verdict} — adjusting enforcement profile.',
  warheadTemplate: [
    '# ENF-ADAPTIVE-FOLLOWING: Guidance Follow Rate Not Tracked',
    '',
    '## What Happened',
    'The enforcement engine is not tracking how well the agent follows guidance ' +
    'bullets. Guidance follow rate — the percentage of guidance events after ' +
    'which the agent does not re-violate the same rule within 10 turns — is a ' +
    'critical profile signal that is being ignored. Without it, profile decisions ' +
    'rely solely on raw violation rate, which cannot distinguish between an agent ' +
    'that is learning from its mistakes and one that is not.',
    '',
    '## Why This Is Critical',
    'Following guidance is a stronger signal than raw violation rate. Two agents ' +
    'might have identical violation rates, but one learns from guidance (high ' +
    'follow rate) and the other ignores it (low follow rate). The learning agent ' +
    'is a candidate for TRUSTED — it will improve with autonomy. The non-learning ' +
    'agent needs GUIDED — it requires intensive support to break its failure ' +
    'patterns. Without follow-rate tracking, both agents get the same profile, ' +
    'which is wrong for both. The follow rate recalculates every 20 turns to ' +
    'track the learning trajectory over time.',
    '',
    '## How to Fix',
    '1. Log every guidance bullet push with its rule ID and turn number.',
    '2. For each guidance event, check if a subsequent same-rule violation occurs within 10 turns.',
    '3. Compute follow rate: followed / total.',
    '4. If above 80%, hint toward TRUSTED promotion. If below 40%, hint toward GUIDED.',
    '5. Recalculate every 20 turns to track learning trajectory.',
    '',
    '## Reference',
    'ENF-ADAPTIVE-FOLLOWING — Runtime Grade Bible, Dynamic Guardrails S5.5',
    'See also: ENF-PROFILE-TRUSTED, ENF-PROFILE-GUIDED, ENF-ADAPTIVE-VIOLATION-DROP',
  ].join('\n'),
  evidenceSpec: { id: 'adaptive-following', verify: 'rge-audit', minQuality: 0.85 },
  severity: 'guide',
  layer: 4,
  links: ['ENF-PROFILE-TRUSTED', 'ENF-PROFILE-GUIDED', 'ENF-ADAPTIVE-VIOLATION-DROP'],
  selfVerified: true,
};

// ══ SAFETY NODE (1) ═══════════════════════════════════════════

export const ENF_SAFETY_GATE_OVERRIDE: KnowledgeNode = {
  id: 'ENF-SAFETY-GATE-OVERRIDE',
  source: 'rg-standards',
  sourceFile: 'RUNTIME_GRADE_BIBLE.md',
  category: 'enforcement',
  rule: [
    'SAFETY GATES OVERRIDE PROFILES: TEST, AUDIT, and DELIVERY gates always enforce GUIDED.',
    'No profile — not even TRUSTED — may reduce enforcement on safety-critical gates.',
    'Safety gates verify correctness: testing, auditing, final delivery.',
    'Sampling or skipping checks on safety gates is a CRITICAL violation.',
    'The override is non-negotiable and hardcoded in the enforcement engine.',
    'Even TRUSTED agents get full analysis, strict evidence, and high-frequency guidance.',
    'Safety gate override ensures that trust never compromises verification integrity.',
  ].join('\n'),
  detectionMethod:
    'For each gate transition into TEST, AUDIT, or DELIVERY, verify the ' +
    'enforcement profile is forced to GUIDED regardless of agent performance ' +
    'metrics. Check that preWriteAnalysis is "every" (not sampled/skip) and ' +
    'evidenceVerification is "strict". Flag if any safety gate operates with ' +
    'reduced enforcement due to a TRUSTED profile.',
  fixTemplate: [
    'const SAFETY_GATES = new Set(["TEST", "AUDIT", "DELIVERY"]);',
    '',
    'function enforceSafetyOverride(gate: string, config: EnforcementConfig): EnforcementConfig {',
    '  if (SAFETY_GATES.has(gate)) {',
    '    return {',
    '      ...config,',
    '      preWriteAnalysis: "every",       // force full analysis',
    '      evidenceVerification: "strict",  // force triple evidence',
    '      guidanceFrequency: "high",       // force high guidance',
    '      profile: "guided",               // force GUIDED',
    '    };',
    '  }',
    '  return config; // non-safety gates keep their profile',
    '}',
  ].join('\n'),
  conditions: [
    { field: 'gate', op: 'in', value: ['TEST', 'AUDIT', 'DELIVERY'] },
  ],
  bulletTemplate:
    'Safety gate {gate}: GUIDED override active. No sampling allowed.',
  warheadTemplate: [
    '# ENF-SAFETY-GATE-OVERRIDE: Safety Gate Enforcement Reduced',
    '',
    '## What Happened',
    'A safety-critical gate (TEST, AUDIT, or DELIVERY) is operating with reduced ' +
    'enforcement because the agent has a TRUSTED or STANDARD profile. The safety ' +
    'gate override — which forces GUIDED-level enforcement on all safety gates ' +
    'regardless of agent performance — was not applied. Sampled checks, trust-mode ' +
    'evidence verification, or minimal guidance are active on a gate where ' +
    'correctness verification is the entire purpose.',
    '',
    '## Why This Is Critical',
    'Safety gates exist to verify correctness. TEST runs container tests, AUDIT ' +
    'performs adversarial review, DELIVERY ships the final artifact. These are ' +
    'the last lines of defense. Reducing enforcement on them — even for a trusted ' +
    'agent — compromises the integrity of the entire build. A trusted agent that ' +
    'has been correct 99% of the time can still ship a critical defect. The safety ' +
    'gate override ensures that no amount of earned trust bypasses verification. ' +
    'This is the trust-but-verify principle in its strongest form: trust is earned ' +
    'for velocity, but verification is mandatory for safety. The override is ' +
    'hardcoded — it cannot be disabled by configuration.',
    '',
    '## How to Fix',
    '1. Wrap every gate-evaluation with enforceSafetyOverride(gate, config).',
    '2. For TEST/AUDIT/DELIVERY, force: preWriteAnalysis=every, profile=guided.',
    '3. Disable sampled checks entirely on safety gates.',
    '4. Verify evidence verification is "strict" (triple evidence rule enforced).',
    '5. Add a test: TRUSTED profile plus DELIVERY gate produces GUIDED config.',
    '',
    '## Reference',
    'ENF-SAFETY-GATE-OVERRIDE — Runtime Grade Bible, Dynamic Guardrails S6',
    'See also: IL19-GATE-ORDER-IMMUTABLE, ENF-PROFILE-TRUSTED, ENF-SAMPLING-TRUSTED',
  ].join('\n'),
  evidenceSpec: { id: 'safety-gate-override', verify: 'gate-chain', minQuality: 0.99 },
  severity: 'block',
  layer: 5,
  links: ['IL19-GATE-ORDER-IMMUTABLE', 'ENF-PROFILE-TRUSTED', 'ENF-SAMPLING-TRUSTED'],
  selfVerified: true,
};

// ══ SAMPLING NODES (2) ════════════════════════════════════════

export const ENF_SAMPLING_TRUSTED: KnowledgeNode = {
  id: 'ENF-SAMPLING-TRUSTED',
  source: 'rg-standards',
  sourceFile: 'RUNTIME_GRADE_BIBLE.md',
  category: 'enforcement',
  rule: [
    'TRUSTED PROFILE USES SAMPLED CHECKS: Trusted agents get enforcement every Nth call.',
    'Sampling rate: 1 in 3 calls receive full pre-write analysis (N=3).',
    'The other 2 calls receive lightweight post-write verification only.',
    'Sampling reduces enforcement overhead by roughly 67% for trusted agents.',
    'Sampling is randomized per-call to prevent predictable evasion.',
    'If a sampled check finds a violation, ALL subsequent calls get full analysis.',
    'Sampling is disabled entirely on safety gates (ENF-SAFETY-GATE-OVERRIDE).',
  ].join('\n'),
  detectionMethod:
    'For agents in TRUSTED profile, verify that pre-write analysis is applied on ' +
    'roughly 1 in 3 calls (33% plus or minus 5%). Check that the sampling is ' +
    'randomized (not deterministic every-3rd). Verify that a sampled-check ' +
    'violation triggers full analysis on all subsequent calls. Flag if sampling ' +
    'is applied on safety gates or if the rate deviates significantly from 33%.',
  fixTemplate: [
    'class SampledEnforcement {',
    '  private fullAnalysisUntil = 0; // turn after which sampling resumes',
    '',
    '  shouldAnalyze(turn: number, profile: EnforcementProfile, gate: string): boolean {',
    '    if (profile !== "trusted")               return true; // non-trusted: always',
    '    if (SAFETY_GATES.has(gate))              return true; // safety: always',
    '    if (turn < this.fullAnalysisUntil)       return true; // post-violation: always',
    '    return Math.random() < 0.33;             // 1-in-3 sampled',
    '  }',
    '',
    '  onViolationDetected(turn: number): void {',
    '    this.fullAnalysisUntil = turn + 20; // full analysis for 20 turns',
    '  }',
    '}',
  ].join('\n'),
  conditions: [
    { field: 'phase', op: 'equals', value: 'pre-execution' },
  ],
  bulletTemplate:
    'Trusted sampling: every 3rd call checked. Spotcheck still applies.',
  warheadTemplate: [
    '# ENF-SAMPLING-TRUSTED: Sampling Misconfiguration',
    '',
    '## What Happened',
    'The sampled enforcement for a TRUSTED-profile agent is misconfigured. ' +
    'Possible issues: (1) sampling rate is not 1-in-3 (too high wastes budget, ' +
    'too low risks defects), (2) sampling is deterministic (every-3rd) rather ' +
    'than randomized, allowing predictable evasion, (3) a sampled-check ' +
    'violation did not trigger full analysis on subsequent calls, or (4) ' +
    'sampling is active on a safety gate.',
    '',
    '## Why This Is Critical',
    'Sampled enforcement is the primary velocity mechanism for TRUSTED agents. ' +
    'It trades upfront analysis cost for agent speed — but only if configured ' +
    'correctly. A 1-in-3 rate (33%) balances overhead reduction with defect ' +
    'detection probability. Randomization prevents the agent from predicting ' +
    'which calls will be checked, making evasion impossible. The violation ' +
    'escalation (full analysis for 20 turns after any sampled-check finding) ' +
    'ensures that if the sampling misses something, the subsequent calls catch ' +
    'it. Safety gate exclusion (ENF-SAFETY-GATE-OVERRIDE) is absolute — sampling ' +
    'on safety gates is a CRITICAL violation because it can let defects through ' +
    'the last line of defense.',
    '',
    '## How to Fix',
    '1. Verify sampling rate is 0.33 (1-in-3) for TRUSTED profile only.',
    '2. Use Math.random() < 0.33, not turn % 3 === 0 (randomized, not deterministic).',
    '3. On any sampled-check violation, set fullAnalysisUntil = turn + 20.',
    '4. Exclude safety gates from sampling entirely.',
    '5. Monitor sampling rate over time: should be 33% plus or minus 5%.',
    '',
    '## Reference',
    'ENF-SAMPLING-TRUSTED — Runtime Grade Bible, Dynamic Guardrails S7.1',
    'See also: ENF-PROFILE-TRUSTED, ENF-SAFETY-GATE-OVERRIDE, ENF-RANDOM-SPOTCHECK',
  ].join('\n'),
  evidenceSpec: { id: 'sampling-trusted', verify: 'rge-audit', minQuality: 0.88 },
  severity: 'warn',
  layer: 4,
  links: ['ENF-PROFILE-TRUSTED', 'ENF-SAFETY-GATE-OVERRIDE', 'ENF-RANDOM-SPOTCHECK'],
  selfVerified: true,
};

export const ENF_RANDOM_SPOTCHECK: KnowledgeNode = {
  id: 'ENF-RANDOM-SPOTCHECK',
  source: 'rg-standards',
  sourceFile: 'RUNTIME_GRADE_BIBLE.md',
  category: 'enforcement',
  rule: [
    'RANDOM SPOTCHECK: Even trusted agents receive 1-in-20 random full verification.',
    'The spotcheck rate (5%) is independent of the sampling rate (ENF-SAMPLING-TRUSTED).',
    'A spotcheck performs the same analysis as a standard-profile check.',
    'Purpose: detect gaming, drift, or regression that sampling might miss.',
    'Spotchecks are unpredictable — the agent cannot know which call will be fully checked.',
    'If a spotcheck finds a violation, the agent is immediately demoted from TRUSTED.',
    'This is the trust-but-verify principle applied to enforcement profiles.',
  ].join('\n'),
  detectionMethod:
    'For agents in TRUSTED profile, verify that an additional 5% random ' +
    'spotcheck is applied on top of the 33% sampling. The spotcheck performs ' +
    'full standard-profile analysis. Verify that a spotcheck violation triggers ' +
    'immediate TRUSTED demotion. Flag if the spotcheck rate is missing, too low ' +
    '(below 3%), or if violations found by spotcheck do not trigger demotion.',
  fixTemplate: [
    'class SpotcheckEnforcement {',
    '  shouldSpotcheck(profile: EnforcementProfile): boolean {',
    '    if (profile !== "trusted") return false; // only trusted gets spotchecked',
    '    return Math.random() < 0.05;             // 1-in-20 (5%)',
    '  }',
    '',
    '  onSpotcheckViolation(): ProfileChange {',
    '    // Immediate demotion — spotcheck found what sampling missed.',
    '    return { from: "trusted", to: "standard",',
    '             reason: "spotcheck-violation", immediate: true };',
    '  }',
    '}',
  ].join('\n'),
  conditions: [
    { field: 'phase', op: 'equals', value: 'pre-execution' },
  ],
  bulletTemplate:
    'Random spotcheck triggered. Full analysis on this call.',
  warheadTemplate: [
    '# ENF-RANDOM-SPOTCHECK: Spotcheck Missing or Ineffective',
    '',
    '## What Happened',
    'The enforcement engine either (1) does not perform random spotchecks on ' +
    'TRUSTED-profile agents, (2) has a spotcheck rate below the 5% threshold, or ' +
    '(3) performs spotchecks but does not demote on violation. The spotcheck ' +
    'layer is the final safety net for the trust system — without it, a TRUSTED ' +
    'agent can drift or game the system indefinitely with only 33% sampling ' +
    'coverage.',
    '',
    '## Why This Is Critical',
    'Sampling (ENF-SAMPLING-TRUSTED) checks 1 in 3 calls. That means 2 in 3 ' +
    'calls receive only lightweight post-write verification. A determined agent ' +
    'could potentially exploit the 67% unsampled calls. The random spotcheck ' +
    '(5% additional, independent of sampling) makes this exploitation risky: any ' +
    'given call has a roughly 5% chance of full analysis regardless of the ' +
    'sampling schedule. Since spotchecks are unpredictable and independent, the ' +
    'agent cannot know which calls will be fully checked. If a spotcheck catches ' +
    'a violation, immediate demotion from TRUSTED ensures the agent cannot ' +
    'continue exploiting the sampling gap. This is trust-but-verify in its ' +
    'purest form.',
    '',
    '## How to Fix',
    '1. Add a Math.random() < 0.05 check for TRUSTED-profile agents.',
    '2. The spotcheck is INDEPENDENT of the sampling check — both can fire.',
    '3. On spotcheck, perform full standard-profile analysis.',
    '4. If the spotcheck finds a violation, immediately demote TRUSTED to STANDARD.',
    '5. Log spotcheck events and outcomes for audit trail.',
    '',
    '## Reference',
    'ENF-RANDOM-SPOTCHECK — Runtime Grade Bible, Dynamic Guardrails S7.2',
    'See also: ENF-SAMPLING-TRUSTED, ENF-PROFILE-TRUSTED, IL10-EVIDENCE-IS-MECHANICAL',
  ].join('\n'),
  evidenceSpec: { id: 'random-spotcheck', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['ENF-SAMPLING-TRUSTED', 'ENF-PROFILE-TRUSTED', 'IL10-EVIDENCE-IS-MECHANICAL'],
  selfVerified: true,
};

// ══ EXPORTS ═══════════════════════════════════════════════════

export const enforcementNodes: KnowledgeNode[] = [
  ENF_ESCALATION_CUMULATIVE,
  ENF_ESCALATION_DECAY,
  ENF_ESCALATION_FIRST_SEVERITY,
  ENF_ESCALATION_REPEAT,
  ENF_PROFILE_TRUSTED,
  ENF_PROFILE_STANDARD,
  ENF_PROFILE_GUIDED,
  ENF_ADAPTIVE_SUCCESS_DROP,
  ENF_ADAPTIVE_VIOLATION_DROP,
  ENF_ADAPTIVE_SPEED_SLOW,
  ENF_ADAPTIVE_SPEED_FAST,
  ENF_ADAPTIVE_FOLLOWING,
  ENF_SAFETY_GATE_OVERRIDE,
  ENF_SAMPLING_TRUSTED,
  ENF_RANDOM_SPOTCHECK,
];
