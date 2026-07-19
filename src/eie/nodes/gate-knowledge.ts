/**
 * src/eie/nodes/gate-knowledge.ts — 36 Gate-Specific Knowledge Nodes
 *
 * 6 gates x 6 knowledge areas each.
 * Source: EIE_DESIGN_SPEC.md section 8 + Appendix C
 */

import type { KnowledgeNode } from '../types';

function gk(
  id: string, gate: string, rule: string, verify: 'spec-read' | 'rge-audit' | 'sre-audit' | 'exec-tsc' | 'exec-build' | 'test-run' | 'container-tui-test' | 'fs-check' | 'claim-reality' | 'gate-chain' | 'diff-check',
  sev: 'block' | 'warn' | 'guide', layer: 0 | 1 | 2 | 3 | 4 | 5, links: string[],
): KnowledgeNode {
  return {
    id, source: 'alg-sys' as const, sourceFile: 'EIE_DESIGN_SPEC.md',
    category: 'gate-knowledge' as const,
    rule, detectionMethod: 'Gate-specific knowledge for ' + gate + ' gate.',
    fixTemplate: 'Follow the rule for ' + gate + ' gate.',
    conditions: [{ field: 'gate', op: 'equals', value: gate }],
    bulletTemplate: id + ': ' + rule.split('\n')[0],
    warheadTemplate: '# ' + gate + ' Gate: ' + id + '\n' + rule,
    evidenceSpec: { id: id.toLowerCase(), verify, minQuality: 0.95 },
    severity: sev, layer, links, selfVerified: true,
  };
}

// PLAN GATE (6)
export const GK_PLAN_7Q: KnowledgeNode = gk('GK-PLAN-7Q', 'PLAN',
  'PLAN GATE — 7-QUESTION CHECKLIST: What is being built? Components? Architecture? Test protocol? Error strategy? Build order? Scope?',
  'spec-read', 'block', 5, ['GR-PLAN-SPEC']);

export const GK_PLAN_BUILD_ORDER: KnowledgeNode = gk('GK-PLAN-BUILD-ORDER', 'PLAN',
  'PLAN GATE — BUILD ORDER: Define failure-mode-first build order. Types then error handling then resources then features.',
  'spec-read', 'block', 5, ['GR-PLAN-BUILD-ORDER']);

export const GK_PLAN_SCOPE: KnowledgeNode = gk('GK-PLAN-SCOPE', 'PLAN',
  'PLAN GATE — SCOPE DISCIPLINE: Define exact scope. List files to create and modify. No scope creep.',
  'spec-read', 'block', 5, ['GR-PLAN-SCOPE', 'FM-13-SCOPE-CREEP']);

export const GK_PLAN_SPEC_TEMPLATE: KnowledgeNode = gk('GK-PLAN-SPEC-TEMPLATE', 'PLAN',
  'PLAN GATE — SPEC.md TEMPLATE: Follow template with clear markdown headers: Overview, Architecture, Components, Test Protocol.',
  'spec-read', 'block', 5, ['GR-PLAN-SPEC']);

export const GK_PLAN_DEPS: KnowledgeNode = gk('GK-PLAN-DEPS', 'PLAN',
  'PLAN GATE — DEPENDENCY IDENTIFICATION: List all dependencies. Check for circular deps. Verify blast radius.',
  'spec-read', 'warn', 5, ['SEC-SUPPLY-BLAST-RADIUS', 'SEC-SUPPLY-CYCLES']);

export const GK_PLAN_CONFIG: KnowledgeNode = gk('GK-PLAN-CONFIG', 'PLAN',
  'PLAN GATE — CONFIG VALIDATION: Define all config values, their types, ranges, and defaults.',
  'spec-read', 'warn', 5, ['P8-CONFIG-VALIDATION']);

// BUILD GATE (6)
export const GK_BUILD_P1_P10: KnowledgeNode = gk('GK-BUILD-P1-P10', 'BUILD',
  'BUILD GATE — P1-P10 ENFORCEMENT: Every write checked against P1-P10 principles. No violations allowed.',
  'rge-audit', 'block', 4, ['P1-DEFENSIVE-IMPORT', 'P2-TYPE-CERTAINTY', 'P3-ERROR-COMPLETENESS']);

export const GK_BUILD_ERROR_HANDLING: KnowledgeNode = gk('GK-BUILD-ERROR-HANDLING', 'BUILD',
  'BUILD GATE — ERROR HANDLING: Every catch must log + recover or re-throw. No empty catches.',
  'sre-audit', 'block', 4, ['P3-ERROR-COMPLETENESS', 'IL04-NO-SILENT-FAILURE']);

export const GK_BUILD_TYPE_SAFETY: KnowledgeNode = gk('GK-BUILD-TYPE-SAFETY', 'BUILD',
  'BUILD GATE — TYPE SAFETY: No any. No unguarded as. Validate types at boundaries.',
  'rge-audit', 'block', 3, ['P2-TYPE-CERTAINTY', 'TS-SF-NO-ANY']);

export const GK_BUILD_RESOURCE_LIFECYCLE: KnowledgeNode = gk('GK-BUILD-RESOURCE', 'BUILD',
  'BUILD GATE — RESOURCE LIFECYCLE: Every resource acquired must be cleaned up in finally.',
  'rge-audit', 'block', 4, ['P4-RESOURCE-LIFECYCLE', 'IL06-RESOURCE-OWNERSHIP']);

export const GK_BUILD_ANTI_THEATRICAL: KnowledgeNode = gk('GK-BUILD-ANTI-THEATRICAL', 'BUILD',
  'BUILD GATE — ANTI-THEATRICAL: No functions that claim work without doing it. Zero tolerance.',
  'sre-audit', 'block', 4, ['P11-OUTPUT-IS-THE-WORK', 'IL18-THEATRICAL-CODE-ZERO']);

export const GK_BUILD_EMPTY_STATE: KnowledgeNode = gk('GK-BUILD-EMPTY-STATE', 'BUILD',
  'BUILD GATE — EMPTY STATE: Guard all collection operations against empty inputs.',
  'rge-audit', 'warn', 2, ['P12-EMPTY-STATE-GUARD', 'IL12-EMPTY-IS-NOT-SUCCESS']);

// VERIFY GATE (6)
export const GK_VERIFY_TSC: KnowledgeNode = gk('GK-VERIFY-TSC', 'VERIFY',
  'VERIFY GATE — TSC: Run tsc --noEmit. Exit code must be 0.',
  'exec-tsc', 'block', 5, ['GR-VERIFY-TSC', 'TS-DIAGNOSTICS']);

export const GK_VERIFY_BUILD: KnowledgeNode = gk('GK-VERIFY-BUILD', 'VERIFY',
  'VERIFY GATE — BUILD: Run bun build. Exit code must be 0. Bundle must exist.',
  'exec-build', 'block', 5, ['GR-VERIFY-BUILD']);

export const GK_VERIFY_RGE: KnowledgeNode = gk('GK-VERIFY-RGE', 'VERIFY',
  'VERIFY GATE — RGE AUDIT: Run Runtime Grade Engine. Critical findings must be 0.',
  'rge-audit', 'block', 5, ['GR-VERIFY-RGE-SCORE']);

export const GK_VERIFY_SRE: KnowledgeNode = gk('GK-VERIFY-SRE', 'VERIFY',
  'VERIFY GATE — SRE AUDIT: Run Slop Removal Engine. Theatrical findings must be 0.',
  'sre-audit', 'block', 5, ['GR-VERIFY-SRE-SCORE']);

export const GK_VERIFY_TYPECHECKER: KnowledgeNode = gk('GK-VERIFY-TYPECHECKER', 'VERIFY',
  'VERIFY GATE — TYPECHECKER PATTERNS: Use TypeChecker for deep type analysis.',
  'exec-tsc', 'guide', 3, ['TS-COMPILER-CHECKER', 'TS-CHECKER-ASSIGNABLE']);

export const GK_VERIFY_EVIDENCE: KnowledgeNode = gk('GK-VERIFY-EVIDENCE', 'VERIFY',
  'VERIFY GATE — EVIDENCE: Produce mechanical evidence — tsc exit code, build exit code, RGE score, SRE score.',
  'claim-reality', 'block', 5, ['IL10-EVIDENCE-IS-MECHANICAL', 'IL15-EVIDENCE-TRIPLE-RULE']);

// TEST GATE (6)
export const GK_TEST_CONTAINER_BIBLE: KnowledgeNode = gk('GK-TEST-CONTAINER-BIBLE', 'TEST',
  'TEST GATE — CONTAINER TESTING BIBLE: Follow the 12-step protocol exactly.',
  'container-tui-test', 'block', 5, ['TEST-CONTAINER-TUI', 'TEST-FORBIDDEN-METHODS']);

export const GK_TEST_FORBIDDEN: KnowledgeNode = gk('GK-TEST-FORBIDDEN', 'TEST',
  'TEST GATE — FORBIDDEN METHODS: opencode run, node -e, require, grep bundles, text matching. All FORBIDDEN.',
  'sre-audit', 'block', 4, ['TEST-FORBIDDEN-METHODS', 'AP-OPENCODE-RUN']);

export const GK_TEST_EVIDENCE_REQ: KnowledgeNode = gk('GK-TEST-EVIDENCE-REQ', 'TEST',
  'TEST GATE — EVIDENCE: ContainerTestResult.json with pass rate >= 96 percent, unit test exit 0 with pass >= 80 percent.',
  'test-run', 'block', 5, ['TEST-EVIDENCE-REQUIREMENTS', 'IL15-EVIDENCE-TRIPLE-RULE']);

export const GK_TEST_MECHANICAL: KnowledgeNode = gk('GK-TEST-MECHANICAL', 'TEST',
  'TEST GATE — MECHANICAL VERIFICATION: Verify behavior through mechanical observation.',
  'container-tui-test', 'block', 5, ['TEST-MECHANICAL-VERIFICATION']);

export const GK_TEST_NEGATIVE: KnowledgeNode = gk('GK-TEST-NEGATIVE', 'TEST',
  'TEST GATE — NEGATIVE TESTING: Test invalid inputs, boundaries, error paths, security, concurrency.',
  'test-run', 'warn', 4, ['TEST-NEGATIVE-INPUT', 'TEST-NEGATIVE-BOUNDARY']);

export const GK_TEST_CHECKSUM: KnowledgeNode = gk('GK-TEST-CHECKSUM', 'TEST',
  'TEST GATE — CHECKSUM VERIFICATION: Verify sha256 checksums between host and container dist match.',
  'fs-check', 'block', 5, ['GR-DELIVERY-CHECKSUM']);

// AUDIT GATE (6)
export const GK_AUDIT_22_LAYER: KnowledgeNode = gk('GK-AUDIT-22-LAYER', 'AUDIT',
  'AUDIT GATE — 22-LAYER AUDIT: Run all 22 audit layers (R0-R22). Each layer enhanced with EIE knowledge.',
  'rge-audit', 'block', 5, ['GR-AUDIT-SPEC-ALIGNMENT']);

export const GK_AUDIT_ADVERSARIAL: KnowledgeNode = gk('GK-AUDIT-ADVERSARIAL', 'AUDIT',
  'AUDIT GATE — ADVERSARIAL PATTERNS: Check for prompt injection, enforcement gaming, supply chain issues.',
  'rge-audit', 'block', 5, ['SEC-INJECTION-DIRECT', 'SEC-GAMING-BYPASS', 'GR-AUDIT-ADVERSARIAL']);

export const GK_AUDIT_CLAIM_REALITY: KnowledgeNode = gk('GK-AUDIT-CLAIM-REALITY', 'AUDIT',
  'AUDIT GATE — CLAIM-REALITY: Compare agent claims against FS, tests, and RGE. No mismatches.',
  'claim-reality', 'block', 5, ['IL01-OUTPUT-IS-REALITY', 'GR-AUDIT-CLAIM-REALITY']);

export const GK_AUDIT_BIBLE: KnowledgeNode = gk('GK-AUDIT-BIBLE', 'AUDIT',
  'AUDIT GATE — BIBLE ENFORCEMENT: Verify code follows Runtime Grade Bible. All P1-P12, IL01-IL22.',
  'rge-audit', 'block', 5, ['P1-DEFENSIVE-IMPORT', 'IL01-OUTPUT-IS-REALITY']);

export const GK_AUDIT_SPEC_FIDELITY: KnowledgeNode = gk('GK-AUDIT-SPEC-FIDELITY', 'AUDIT',
  'AUDIT GATE — SPEC FIDELITY: Code must match SPEC.md. No deviations without documented decisions.',
  'spec-read', 'block', 5, ['GR-AUDIT-SPEC-ALIGNMENT']);

export const GK_AUDIT_BUILD_ORDER: KnowledgeNode = gk('GK-AUDIT-BUILD-ORDER', 'AUDIT',
  'AUDIT GATE — BUILD ORDER: Verify code follows failure-mode-first build order.',
  'rge-audit', 'warn', 5, ['GR-AUDIT-BUILD-ORDER', 'GK-PLAN-BUILD-ORDER']);

// DELIVERY GATE (6)
export const GK_DELIVERY_SHIP_PKG: KnowledgeNode = gk('GK-DELIVERY-SHIP-PKG', 'DELIVERY',
  'DELIVERY GATE — SHIP PACKAGE: dist must exist with content. Bundle must be > 0 bytes.',
  'fs-check', 'block', 5, ['GR-DELIVERY-SHIP-PACKAGE']);

export const GK_DELIVERY_CHECKSUM: KnowledgeNode = gk('GK-DELIVERY-CHECKSUM', 'DELIVERY',
  'DELIVERY GATE — CHECKSUM: Generate SHA-256 checksum of bundle. Store as evidence.',
  'fs-check', 'block', 5, ['GR-DELIVERY-CHECKSUM', 'GK-TEST-CHECKSUM']);

export const GK_DELIVERY_EVIDENCE_ARCHIVE: KnowledgeNode = gk('GK-DELIVERY-EVIDENCE-ARCHIVE', 'DELIVERY',
  'DELIVERY GATE — EVIDENCE ARCHIVE: Collect all gate evidence into archive with Merkle manifest.',
  'fs-check', 'block', 5, ['GR-DELIVERY-EVIDENCE-ARCHIVE', 'PERSIST-EVIDENCE-COLLECT']);

export const GK_DELIVERY_SPEC_FIDELITY: KnowledgeNode = gk('GK-DELIVERY-SPEC-FIDELITY', 'DELIVERY',
  'DELIVERY GATE — SPEC FIDELITY: Final code must match SPEC.md. All features delivered.',
  'spec-read', 'block', 5, ['GK-AUDIT-SPEC-FIDELITY']);

export const GK_DELIVERY_CHANGELOG: KnowledgeNode = gk('GK-DELIVERY-CHANGELOG', 'DELIVERY',
  'DELIVERY GATE — CHANGELOG: Document all changes made. List files created and modified.',
  'fs-check', 'warn', 5, ['GR-DELIVERY-CHANGELOG']);

export const GK_DELIVERY_DEBUG_LOG: KnowledgeNode = gk('GK-DELIVERY-DEBUG-LOG', 'DELIVERY',
  'DELIVERY GATE — DEBUG LOG: Include debug log of build process.',
  'fs-check', 'warn', 5, ['GR-DELIVERY-DEBUG-LOG']);

export const gateKnowledge: KnowledgeNode[] = [
  GK_PLAN_7Q, GK_PLAN_BUILD_ORDER, GK_PLAN_SCOPE, GK_PLAN_SPEC_TEMPLATE, GK_PLAN_DEPS, GK_PLAN_CONFIG,
  GK_BUILD_P1_P10, GK_BUILD_ERROR_HANDLING, GK_BUILD_TYPE_SAFETY, GK_BUILD_RESOURCE_LIFECYCLE, GK_BUILD_ANTI_THEATRICAL, GK_BUILD_EMPTY_STATE,
  GK_VERIFY_TSC, GK_VERIFY_BUILD, GK_VERIFY_RGE, GK_VERIFY_SRE, GK_VERIFY_TYPECHECKER, GK_VERIFY_EVIDENCE,
  GK_TEST_CONTAINER_BIBLE, GK_TEST_FORBIDDEN, GK_TEST_EVIDENCE_REQ, GK_TEST_MECHANICAL, GK_TEST_NEGATIVE, GK_TEST_CHECKSUM,
  GK_AUDIT_22_LAYER, GK_AUDIT_ADVERSARIAL, GK_AUDIT_CLAIM_REALITY, GK_AUDIT_BIBLE, GK_AUDIT_SPEC_FIDELITY, GK_AUDIT_BUILD_ORDER,
  GK_DELIVERY_SHIP_PKG, GK_DELIVERY_CHECKSUM, GK_DELIVERY_EVIDENCE_ARCHIVE, GK_DELIVERY_SPEC_FIDELITY, GK_DELIVERY_CHANGELOG, GK_DELIVERY_DEBUG_LOG,
];
