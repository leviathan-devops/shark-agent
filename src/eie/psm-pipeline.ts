// src/eie/psm-pipeline.ts
// Enhanced Trident PSM — 6-layer scientific method for software engineering problem solving.

import type { AgentState, KnowledgeNode } from './types';
import { matchKnowledge } from './context-matcher';

export type PSMLayer = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Maximum number of PSM iterations before LOCKOUT (per spec 08_PSM_PIPELINE).
 * Iterations are 0, 1, 2 — the third restart (iteration 3) triggers LOCKOUT.
 */
export const MAX_PSM_ITERATIONS = 3;

export interface PSMState {
  currentLayer: PSMLayer;
  iteration: number;  // 0, 1, 2 (max 3 before LOCKOUT)
  hypothesis: string;
  expectedOutput: string;
  actualOutput: string;
  gapAnalysis: string;
  metaReflection: string;
  verification: string;
  loopType?: string;
  evidenceValid: boolean;
  claimRealityPassed?: boolean;
  activatedAt: number;
  activatedBy: string;
}

export interface PSMLayerTemplate {
  layer: PSMLayer;
  name: string;
  prompt: string;
  minChars: number;
  build: (state: PSMState, eieNodes: KnowledgeNode[]) => string;
}

const LAYER_TEMPLATES: PSMLayerTemplate[] = [
  {
    layer: 1,
    name: 'ASSUMPTION',
    prompt: 'What do you assume about this bug/issue?',
    minChars: 300,
    build: (state, nodes) => {
      const eieKnowledge = nodes.length > 0
        ? '\n\n## Relevant Engineering Knowledge\n' + nodes.slice(0, 3).map(n => '- ' + n.rule.split('\n')[0]).join('\n')
        : '';
      return [
        '## Reasoning Chain',
        '',
        '### Hypothesis',
        '[State your assumption about the root cause in ONE sentence]',
        '',
        '### Why You Believe This',
        '[Evidence from logs, error messages, code analysis — NOT from agent reasoning]',
        '',
        '### Success Criteria',
        '[What observable result would confirm this hypothesis?]',
        '',
        '### Disproof Criteria',
        '[What observable result would PROVE THIS WRONG? — Required, not optional]',
        eieKnowledge
      ].join('\n');
    }
  },
  {
    layer: 2,
    name: 'ACTION',
    prompt: 'What exact action will you take?',
    minChars: 200,
    build: (state, nodes) => {
      const fixSuggestions = nodes.filter(n => n.category === 'fix-pattern' || n.category === 'error-recovery').slice(0, 3);
      const eieFixes = fixSuggestions.length > 0
        ? '\n\n## Suggested Fix Patterns\n' + fixSuggestions.map(n => '### ' + n.id + '\n' + n.fixTemplate).join('\n\n')
        : '';
      return [
        '## Working Plan',
        '',
        '### Exact Command',
        '[The EXACT command/code to run — no placeholders]',
        '',
        '### Expected Output',
        '[What you EXPECT to see BEFORE running — prevents confirmation bias]',
        '',
        '### Environment State',
        '| Variable | Value |',
        '|----------|-------|',
        '| Gate | ' + (state.iteration > 0 ? 'V' + state.iteration + '.0' : 'V1.0') + ' |',
        eieFixes
      ].join('\n');
    }
  },
  {
    layer: 3,
    name: 'OBSERVATION',
    prompt: 'What ACTUALLY happened?',
    minChars: 300,
    build: (state, nodes) => [
      '## Evidence',
      '',
      '### Raw Output',
      '[Copy-paste ACTUAL output — NO paraphrasing, NO summarizing]',
      '',
      '### Expected vs Actual',
      '| Aspect | Expected | Actual |',
      '|--------|----------|--------|',
      '| Exit code | [from Layer 2] | [actual] |',
      '| Output | [from Layer 2] | [actual] |',
      '',
      '### Logs Checked',
      '| Log | Finding |',
      '|-----|---------|',
      '| [log] | [what it shows] |',
      '',
      '⚠️ Agent-created evidence = INVALID. Only external system output counts.'
    ].join('\n')
  },
  {
    layer: 4,
    name: 'GAP_ANALYSIS',
    prompt: 'What was the gap between expected and actual?',
    minChars: 300,
    build: (state, nodes) => {
      const failurePatterns = nodes.filter(n => n.category === 'failure-pattern').slice(0, 3);
      const eiePatterns = failurePatterns.length > 0
        ? '\n\n## Known Failure Patterns\n' + failurePatterns.map(n => '### ' + n.id + ': ' + n.rule.split('\n')[0] + '\nFix: ' + n.fixTemplate).join('\n\n')
        : '';
      return [
        '## Root Cause Analysis',
        '',
        '### Gap Statement',
        '[Expected X, got Y. The gap is Z.]',
        '',
        '### Previous Assumption',
        '[Was the Layer 1 hypothesis correct? YES/NO + why]',
        '',
        '### Updated Hypothesis',
        '[What do we believe NOW based on this evidence?]',
        '',
        '### Next Action',
        '[What follows logically from this finding?]',
        eiePatterns
      ].join('\n');
    }
  },
  {
    layer: 5,
    name: 'META_REFLECTION',
    prompt: 'What should you have done differently?',
    minChars: 200,
    build: (state, nodes) => {
      const antiPatterns = nodes.filter(n => n.category === 'anti-pattern').slice(0, 5);
      const eieAntiPatterns = antiPatterns.length > 0
        ? '\n\n## Relevant Anti-Patterns\n' + antiPatterns.map(n => '- ' + n.id + ': ' + n.rule.split('\n')[0]).join('\n')
        : '';
      return [
        '## Double-Loop Learning',
        '',
        '### What I Did vs What I Should Have Done',
        '| What I Did | What I Should Have Done |',
        '|-----------|----------------------|',
        '| [actual] | [ideal] |',
        '',
        '### Pattern Extracted',
        '[Name the pattern. When does it apply?]',
        '',
        '### Systemic Issue',
        '[Why is this a PATTERN, not a one-off?]',
        eieAntiPatterns
      ].join('\n');
    }
  },
  {
    layer: 6,
    name: 'VERIFICATION',
    prompt: 'Did the fix work?',
    minChars: 200,
    build: (state, nodes) => [
      '## Verification',
      '',
      '### Execution Result',
      '[Actual output after fix]',
      '',
      '### Requirements Met',
      '| Requirement | Met? | Evidence |',
      '|-------------|------|----------|',
      '| [req] | YES/NO | [evidence] |',
      '',
      '### Regression Check',
      '| Component | Status |',
      '|-----------|--------|',
      '| [component] | [pass/fail] |',
      '',
      '### Side Effects',
      '[Any unintended consequences?]',
      '',
      '### EIE Claim-Reality Check',
      '[The system will verify your claims against filesystem and test results]'
    ].join('\n')
  }
];

/**
 * Get the template for a specific PSM layer.
 */
export function getLayerTemplate(layer: PSMLayer, state: PSMState, agentState: AgentState): string {
  const template = LAYER_TEMPLATES.find(t => t.layer === layer);
  if (!template) return 'Unknown layer: ' + layer;

  // Match EIE knowledge nodes for this layer
  const nodes = matchKnowledge({
    ...agentState,
    phase: 'post-execution'
  });

  return template.build(state, nodes);
}

/**
 * Validate layer content.
 * Checks heading structure and minimum character count.
 */
export function validateLayerContent(layer: PSMLayer, content: string): { valid: boolean; reason: string } {
  const template = LAYER_TEMPLATES.find(t => t.layer === layer);
  if (!template) {
    return { valid: false, reason: 'Unknown layer: ' + layer };
  }

  if (content.length < template.minChars) {
    return { valid: false, reason: 'Content too short: ' + content.length + ' chars (min ' + template.minChars + ')' };
  }

  // Check for required headings
  const requiredHeadings = getRequiredHeadings(layer);
  for (const heading of requiredHeadings) {
    if (!content.includes(heading)) {
      return { valid: false, reason: 'Missing heading: ' + heading };
    }
  }

  const allChecksPassed = content.length >= template.minChars &&
    requiredHeadings.every(h => content.includes(h));
  return { valid: allChecksPassed, reason: allChecksPassed ? 'OK' : 'validation failed' };
}

function getRequiredHeadings(layer: PSMLayer): string[] {
  switch (layer) {
    case 1: return ['## Reasoning Chain', '### Hypothesis', '### Disproof Criteria'];
    case 2: return ['## Working Plan', '### Exact Command', '### Expected Output'];
    case 3: return ['## Evidence', '### Raw Output'];
    case 4: return ['## Root Cause Analysis', '### Gap Statement'];
    case 5: return ['## Double-Loop Learning'];
    case 6: return ['## Verification'];
    default: return [];
  }
}

/**
 * Create initial PSM state.
 *
 * @param activatedBy - Identifier of the engine/system that activated PSM
 *                      (e.g. 'PSE:FM-06', 'orchestrator'). Defaults to 'system'.
 */
export function createPSMState(activatedBy: string = 'system'): PSMState {
  return {
    currentLayer: 1,
    iteration: 0,
    hypothesis: '',
    expectedOutput: '',
    actualOutput: '',
    gapAnalysis: '',
    metaReflection: '',
    verification: '',
    evidenceValid: false,
    activatedAt: Date.now(),
    activatedBy,
  };
}

/**
 * Advance PSM to the next layer.
 *
 * State machine (per spec 08_PSM_PIPELINE):
 *   - currentLayer 1→2→3→4→5→6  (normal in-cycle progression)
 *   - At layer 6 (VERIFICATION):
 *       claim-reality FAIL  → revert to layer 4 (GAP_ANALYSIS)
 *       claim-reality PASS  → cycle complete
 *   - Cycle complete + loop unresolved + iteration < MAX → back to layer 1,
 *     iteration++ (fresh cycle with retained provenance).
 *   - iteration >= MAX_PSM_ITERATIONS → LOCKOUT (no further advance).
 *
 * The returned state should be checked with shouldLockout() before the agent
 * is allowed to continue — a locked-out state cannot make further progress.
 */
export function advancePSMLayer(state: PSMState): PSMState {
  // LOCKOUT guard — once we have hit the iteration ceiling, freeze.
  if (state.iteration >= MAX_PSM_ITERATIONS) {
    return state;
  }

  // Normal in-cycle progression: 1 → 2 → 3 → 4 → 5 → 6.
  if (state.currentLayer < 6) {
    return { ...state, currentLayer: (state.currentLayer + 1) as PSMLayer };
  }

  // ── Layer 6 reached (VERIFICATION) — terminal logic ──

  // Claim-reality FAILED: the fix's claims did not match reality.
  // Revert to GAP_ANALYSIS (layer 4) so the root cause is re-examined.
  if (state.claimRealityPassed === false) {
    return { ...state, currentLayer: 4, claimRealityPassed: undefined };
  }

  // Claim-reality PASSED (true) or not yet checked (undefined): cycle complete.
  // The triggering loop is treated as still unresolved — start a fresh cycle.
  return {
    ...createPSMState(state.activatedBy),
    iteration: state.iteration + 1,
    loopType: state.loopType,
  };
}

/**
 * Get PSM status string for gate/engine consumption.
 * Format: "PSM Layer 3/6 (OBSERVATION) iteration 1".
 * When locked out: "PSM LOCKOUT (iteration 3 >= 3) — VERIFICATION halted".
 */
export function getPSMStatus(state: PSMState): string {
  const layerName = LAYER_TEMPLATES.find(t => t.layer === state.currentLayer)?.name || 'UNKNOWN';
  if (shouldLockout(state)) {
    return 'PSM LOCKOUT (iteration ' + state.iteration + ' >= ' + MAX_PSM_ITERATIONS + ') — ' + layerName + ' halted';
  }
  return 'PSM Layer ' + state.currentLayer + '/6 (' + layerName + ') iteration ' + state.iteration;
}

// ── Evidence Validity ────────────────────────────────────────────

/**
 * Regex patterns indicating EXTERNAL (real, system-produced) evidence.
 * Only output generated by an external system counts as valid evidence —
 * never agent-authored narrative. (spec 08_PSM_PIPELINE §3 OBSERVATION)
 */
const EXTERNAL_EVIDENCE_PATTERNS: RegExp[] = [
  /error\s*TS\d+/i,             // TypeScript compiler errors (e.g. "error TS2304")
  /exit\s*code|exited\s+with/i, // process exit codes
  /stdout|stderr/i,             // captured process streams
  /Compiling|Compiled\s|Build\s+(complete|failed)|bundle\s/i, // build output
  /\.ts\(\d+,\d+\)/,            // ts file:line:col diagnostics
  /uncaught|unhandled\s+(exception|error|rejection)/i, // runtime crashes
  /at\s+[A-Za-z_$][\w$.]*\s+\(/, // stack-trace frames
  /\x1b\[\d+m/,                 // ANSI escape codes (raw terminal output)
  /\d+\s+(passing|failing|pending)/i, // test-runner summaries
  /PASS|FAIL\b.*\(\d+\s*ms\)/i, // jest/vitest result lines
];

/**
 * Regex patterns indicating AGENT-CREATED (fabricated) evidence.
 * First-person narrative like "I checked", "I verified" is NEVER valid
 * evidence — it is the agent asserting its own work rather than showing
 * external system output. (spec anti-pattern: claim-without-progress)
 */
const AGENT_CREATED_PATTERNS: RegExp[] = [
  /\bI\s+(checked|verified|confirmed|ran|tested|inspected|examined|validated)\b/i,
  /\bbased\s+on\s+my\s+(analysis|review|inspection|examination)\b/i,
  /\baccording\s+to\s+(my|the)\s+(analysis|review|inspection)\b/i,
  /\bI\s+can\s+(confirm|see|verify)\b/i,
  /\blooks\s+(correct|fine|good)\s+to\s+me\b/i,
];

/**
 * Check that layer-3 (OBSERVATION) evidence is EXTERNAL — produced by an
 * external system (compiler, test runner, shell) — rather than agent-created
 * narrative ("I checked…", "I verified…").
 *
 * Validity rule:
 *   - Content with external markers AND no agent-only narrative → VALID
 *   - Content with external markers AND some agent narrative → VALID
 *     (external output is the real evidence; narrative is harmless framing)
 *   - Content with agent narrative but NO external markers → INVALID
 *   - Content with neither → INVALID
 *
 * @param content - The layer-3 OBSERVATION content to check.
 * @returns { valid, reason } describing the verdict.
 */
export function checkEvidenceValidity(content: string): { valid: boolean; reason: string } {
  if (!content || content.trim().length === 0) {
    return { valid: false, reason: 'No evidence provided — OBSERVATION content is empty.' };
  }

  const hasExternal = EXTERNAL_EVIDENCE_PATTERNS.some(p => p.test(content));
  const hasAgentClaim = AGENT_CREATED_PATTERNS.some(p => p.test(content));

  if (!hasExternal) {
    if (hasAgentClaim) {
      return {
        valid: false,
        reason: 'Evidence is agent-created (contains "I checked/verified…" phrasing) with no external system output. Agent assertions are NOT evidence.',
      };
    }
    return {
      valid: false,
      reason: 'No external evidence detected (missing error codes, exit codes, stdout/stderr, or stack traces).',
    };
  }

  return { valid: true, reason: 'OK — external system evidence detected.' };
}

// ── Lockout ─────────────────────────────────────────────────────

/**
 * Returns true when the PSM has exhausted its iteration budget and must be
 * LOCKED OUT. Per spec 08_PSM_PIPELINE, after MAX_PSM_ITERATIONS (3) full
 * cycles without resolving the loop, the agent is halted for human review.
 */
export function shouldLockout(state: PSMState): boolean {
  return state.iteration >= MAX_PSM_ITERATIONS;
}
