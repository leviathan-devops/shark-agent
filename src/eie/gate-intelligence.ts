// src/eie/gate-intelligence.ts

import type { AgentState, EvidenceSpec, EvidenceResult } from './types';
import { getNodesForGate } from './context-matcher';
import { generateWarhead } from './warhead-generator';
import { verifyEvidence } from './evidence-verifier';
import { generateBullets } from './bullet-generator';

const GATE_ENTRY_WARHEADS: Record<string, string> = {
  plan: [
    '# PLAN Gate Active',
    '',
    '## What You Can Do',
    '- Write documentation files (*.md, SPEC.md, docs/*)',
    '- Read files, explore codebase',
    '- Use shark-gate to check status',
    '',
    '## What You Cannot Do',
    '- Write source code (*.ts in src/)',
    '- Execute bash commands',
    '- Create files outside docs',
    '',
    '## What You Need to Advance',
    '1. Write SPEC.md with sections:',
    '   # Architecture — describe the system design',
    '   # Requirements — what the tool must do',
    '   # Error Handling — how errors are handled',
    '   # Testing — how to verify it works',
    '2. Call: shark-gate advance',
    '',
    '## Why',
    'Planning before coding prevents rework.',
    'SPEC.md is your contract with the gate system.'
  ].join('\n'),

  build: [
    '# BUILD Gate Active',
    '',
    '## What You Can Do',
    '- Write source code (src/*.ts)',
    '- Create config files (tsconfig.json, package.json)',
    '- Run build commands (tsc, bun build)',
    '- Install dependencies (npm, bun add)',
    '',
    '## What You Cannot Do',
    '- Skip type checking',
    '- Write empty catch blocks',
    '- Use `as any` type bypasses',
    '- Write theatrical code (return true without work)',
    '',
    '## What You Need to Advance',
    '1. Create source files with proper error handling (P3)',
    '2. Type-safe code with no unchecked casts (P2)',
    '3. Compile: npx tsc --noEmit (exit 0 required)',
    '4. Call: shark-gate advance',
    '',
    '## Engineering Standards (P1-P10)',
    'Every function must:',
    '- Validate inputs first (P2)',
    '- Handle errors in ALL paths (P3)',
    '- Clean up resources in finally (P4)',
    '- Return documented types (P10)',
    '- Not claim work without doing it (P11)'
  ].join('\n'),

  verify: [
    '# VERIFY Gate Active',
    '',
    '## What You Can Do',
    '- Run verification commands (tsc, bun build)',
    '- Read evidence files',
    '- Generate evidence',
    '',
    '## What You Need to Advance',
    '1. tsc --noEmit passes (evidence: compiled)',
    '2. Build succeeds (evidence: source-verified)',
    '3. Dependencies installed (evidence: deps-installed)',
    '4. Call: shark-gate advance',
    '',
    '## Verification Commands',
    '- `npx tsc --noEmit` — type check',
    '- `bun build src/index.ts --outdir dist --target bun --format esm --bundle` — build',
    '- `npm ls` — verify dependencies'
  ].join('\n'),

  test: [
    '# TEST Gate Active',
    '',
    '## What You Must Do',
    'Runtime container testing is REQUIRED. NOT smoke tests.',
    '',
    '## Required Process (per Container Testing Bible)',
    '1. Deploy dist to runtime-grade-container-sandbox:master',
    '2. Verify sha256 checksums match (source == container)',
    '3. Write opencode.json with shark as sole plugin',
    '4. Kill/relaunch opencode with --agent flag',
    '5. Wire tmux pipe-pane for stream capture',
    '6. Send NATURAL LANGUAGE task via tmux send-keys',
    '7. Monitor pipe-pane with position-tracked poll loop',
    '8. Observe MECHANICAL behavior (not text matching)',
    '9. Generate ContainerTestResult.json with pass rate >= 96%',
    '',
    '## FORBIDDEN',
    '- opencode run (bypasses TUI)',
    '- Direct scripts (node -e, require())',
    '- Static grep on bundles',
    '- Text matching ("who are you")',
    '',
    '## Why',
    'Runtime grade means it works WHEN EXECUTED.',
    'Not when compiled. Not when grep\'d.',
    'When a real model uses it through a real TUI.'
  ].join('\n'),

  audit: [
    '# AUDIT Gate Active',
    '',
    '## What You Must Do',
    'Full code audit via shark-audit tool.',
    'This is the final boss gate — ALL intelligence applies.',
    '',
    '## Audit Covers (22 Layers)',
    '- R0-R17: Build chain, hooks, state machine, async, error handling,',
    '  deploy, dependencies, config, hygiene, contracts, invocation,',
    '  theatrical, cross-plugin, data flow, CFG, container, Bible, content',
    '- R18: EIE knowledge compliance',
    '- R19: Gate evidence verification',
    '- R20: Adversarial resilience',
    '- R21: Engineering build order',
    '- R22: Claim-reality verification',
    '',
    '## How to Run',
    'Call: shark-audit action=run',
    'Review findings. Fix critical/high issues.',
    'Call: shark-gate advance'
  ].join('\n'),

  delivery: [
    '# DELIVERY Gate Active',
    '',
    '## What You Must Do',
    'Call shark-deliver to package everything.',
    '',
    '## What shark-deliver Does',
    '1. Verifies dist/ exists with content',
    '2. Generates SHA-256 checksum',
    '3. Collects all evidence files',
    '4. Auto-registers: ship-package, checksum, evidence-archive',
    '5. Auto-advances the DELIVERY gate',
    '',
    '## How to Run',
    'Call: shark-deliver',
    'Then: shark-gate advance (if not auto-advanced)',
    '',
    '## Why',
    'Nothing ships without mechanical proof of quality.',
    'The ship package IS the evidence.'
  ].join('\n')
};

/**
 * Get gate entry warhead content for a gate.
 */
export function getGateEntryWarhead(gate: string): string {
  return GATE_ENTRY_WARHEADS[gate.toLowerCase()] || `# ${gate.toUpperCase()} Gate Active\n\nNo specific guidance for this gate.`;
}

/**
 * Generate a gate rejection warhead when evidence is missing.
 * Returns warhead content with specific guidance for each missing evidence ID.
 */
export function generateGateRejectionWarhead(
  gate: string,
  missingEvidence: string[],
  state: AgentState,
  workspacePath: string
): string | null {
  return generateWarhead(
    {
      type: 'gate-rejection',
      gate,
      missingEvidence
    },
    state,
    workspacePath
  );
}

/**
 * Verify all evidence for a gate using semantic verification.
 * Returns list of evidence that FAILED verification.
 */
export function verifyGateEvidence(
  gate: string,
  workspacePath: string,
  evidenceSpecs: Record<string, EvidenceSpec>
): Array<{ id: string; result: EvidenceResult }> {
  const results: Array<{ id: string; result: EvidenceResult }> = [];

  for (const [id, spec] of Object.entries(evidenceSpecs)) {
    const result = verifyEvidence(id, workspacePath, spec);
    if (!result.passed) {
      results.push({ id, result });
    }
  }

  return results;
}

/**
 * Generate gate rejection bullets for output.message.
 * Called BEFORE the gate rejection throw.
 */
export function generateGateRejectionBullets(
  gate: string,
  missingEvidence: string[],
  state: AgentState
): string[] {
  const bullets: string[] = [];

  for (const evId of missingEvidence.slice(0, 3)) {
    // Map evidence IDs to human-readable guidance
    const guidance = EVIDENCE_GUIDANCE[evId];
    if (guidance) {
      bullets.push(guidance.slice(0, 80));
    } else {
      bullets.push(`Evidence needed: ${evId}`.slice(0, 80));
    }
  }

  return bullets;
}

const EVIDENCE_GUIDANCE: Record<string, string> = {
  'spec': 'Write SPEC.md with Architecture, Requirements, Error Handling, Testing.',
  'architecture': 'Add # Architecture section to SPEC.md with system design.',
  'error-strategy': 'Add # Error Handling section to SPEC.md.',
  'compiled': 'Run: npx tsc --noEmit. Exit 0 auto-registers evidence.',
  'source-verified': 'Run: bun build. Exit 0 auto-registers evidence.',
  'deps-installed': 'Run: npm install or bun add. Verifies dependencies.',
  'container-test': 'Deploy to container. Test via TUI. NOT scripts.',
  'unit-test': 'Run: npm test or bun test. Exit 0 required.',
  'browser-test': 'Run browser test suite. Exit 0 required.',
  'trident-report': 'Run: shark-audit action=run. Generates audit report.',
  'semantic-firewall-pass': 'Verify: no SF violations in shark-audit.',
  'no-critical': 'Fix critical findings from shark-audit. 0 required.',
  'spec-alignment': 'Verify code matches SPEC.md requirements.',
  'test-authenticity': 'Verify tests are real (not theatrical).',
  'theatrical-scan': 'Run: shark-audit action=theatrical-scan. 0 violations.',
  'ship-package': 'Call: shark-deliver. Auto-generates dist/ package.',
  'checksum': 'Call: shark-deliver. Auto-generates SHA-256 checksum.',
  'evidence-archive': 'Call: shark-deliver. Auto-collects evidence.',
};
