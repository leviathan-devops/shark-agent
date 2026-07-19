/**
 * src/eie/nodes/testing-nodes.ts — 25 Testing Knowledge Nodes
 *
 * From KB-05 and Algorithmic Systems §5:
 * - Property-based testing standards
 * - Mutation testing thresholds
 * - Container TUI 12-step protocol
 * - Negative testing (5 categories)
 * - Config diff enforcement
 * - Differential testing
 * - Metamorphic testing
 * - Flaky test detection (Wilson score)
 * - Coverage enforcement thresholds
 *
 * Source: KB-05_TESTING_STANDARDS.md + RUNTIME_GRADE_CONTAINER_TESTING_BIBLE.md
 */

import type { KnowledgeNode } from '../types';

// ══ PROPERTY-BASED TESTING ═════════════════════════════════════

export const TEST_PROPERTY_BASED: KnowledgeNode = {
  id: 'TEST-PROPERTY-BASED',
  source: 'alg-sys',
  sourceFile: 'KB-05_TESTING_STANDARDS.md',
  category: 'testing',
  rule: 'PROPERTY-BASED TESTING: Generate hundreds of random inputs to test universal properties, not just examples.',
  detectionMethod: 'Find test suites with only example-based tests (hardcoded inputs/outputs) and no property-based generators.',
  fixTemplate: 'import { fc } from "fast-check"; fc.assert(fc.property(fc.integer(), (n) => expect(fn(n)).toBeDefined()));',
  conditions: [{ field: 'gate', op: 'in', value: ['TEST', 'AUDIT'] }],
  bulletTemplate: 'TEST-PROPERTY: No property-based tests. Add fc.assert(fc.property(...)).',
  warheadTemplate: 'Property-based testing finds edge cases that example tests miss. Use fast-check with property generators.',
  evidenceSpec: { id: 'property-tests', verify: 'test-run', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['TEST-METAMORPHIC', 'TEST-DIFFERENTIAL'],
  selfVerified: true,
};

export const TEST_MUTATION_THRESHOLD: KnowledgeNode = {
  id: 'TEST-MUTATION-THRESHOLD',
  source: 'alg-sys',
  sourceFile: 'KB-05_TESTING_STANDARDS.md',
  category: 'testing',
  rule: 'MUTATION TESTING: Code is well-tested only if mutations (small code changes) are caught by tests. Threshold: 80% mutation score.',
  detectionMethod: 'Run mutation testing framework. Check mutation score >= 80%.',
  fixTemplate: 'Run Stryker or similar. Add tests that catch surviving mutations. Target 80%+ mutation score.',
  conditions: [{ field: 'gate', op: 'in', value: ['TEST', 'AUDIT'] }],
  bulletTemplate: 'TEST-MUTATION: Mutation score below 80%. Add tests for surviving mutants.',
  warheadTemplate: 'Mutation testing verifies test quality. If mutants survive, tests are insufficient.',
  evidenceSpec: { id: 'mutation-score', verify: 'test-run', minQuality: 0.80 },
  severity: 'warn',
  layer: 4,
  links: ['TEST-COVERAGE-THRESHOLD', 'TEST-NEGATIVE-INPUT'],
  selfVerified: true,
};

export const TEST_COVERAGE_THRESHOLD: KnowledgeNode = {
  id: 'TEST-COVERAGE-THRESHOLD',
  source: 'alg-sys',
  sourceFile: 'KB-05_TESTING_STANDARDS.md',
  category: 'testing',
  rule: 'COVERAGE THRESHOLD: Line coverage >= 80%, branch coverage >= 70%, function coverage >= 80%.',
  detectionMethod: 'Run coverage tool. Check thresholds are met.',
  fixTemplate: 'bun test --coverage. Check lcov-report. Add tests for uncovered lines and branches.',
  conditions: [{ field: 'gate', op: 'in', value: ['TEST', 'AUDIT'] }],
  bulletTemplate: 'TEST-COVERAGE: Coverage below threshold (line>=80%, branch>=70%, func>=80%).',
  warheadTemplate: 'Coverage thresholds ensure all code paths are exercised. Low coverage = untested code.',
  evidenceSpec: { id: 'coverage', verify: 'test-run', minQuality: 0.80 },
  severity: 'warn',
  layer: 4,
  links: ['TEST-MUTATION-THRESHOLD', 'TEST-NEGATIVE-INPUT'],
  selfVerified: true,
};

// ══ CONTAINER TUI TESTING ══════════════════════════════════════

export const TEST_CONTAINER_TUI: KnowledgeNode = {
  id: 'TEST-CONTAINER-TUI',
  source: 'alg-sys',
  sourceFile: 'RUNTIME_GRADE_CONTAINER_TESTING_BIBLE.md',
  category: 'testing',
  rule: [
    'CONTAINER TUI 12-STEP PROTOCOL: Full runtime testing via TUI interaction in a container.',
    'Step 1: Deploy dist/ to runtime-grade-container-sandbox:master',
    'Step 2: Verify sha256 checksums match between host and container',
    'Step 3: Write opencode.json with shark as sole plugin',
    'Step 4: Kill any existing opencode process in container',
    'Step 5: Relaunch opencode with --agent flag',
    'Step 6: Wire tmux pipe-pane for stream capture',
    'Step 7: Send NATURAL LANGUAGE task via tmux send-keys (two-step Enter)',
    'Step 8: Monitor pipe-pane with position-tracked poll loop',
    'Step 9: Observe MECHANICAL behavior (not text matching)',
    'Step 10: Generate ContainerTestResult.json',
    'Step 11: Verify pass rate >= 96%',
    'Step 12: Archive evidence to .shark/evidence/',
    'FORBIDDEN: opencode run, node -e, require(), grep on bundles, text matching.',
  ].join('\n'),
  detectionMethod: 'Verify all 12 steps executed. Check ContainerTestResult.json exists with pass rate >= 0.96.',
  fixTemplate: 'Deploy → Verify checksum → Config → Launch → Wire pipe → Send task → Monitor → Observe → Generate result → Verify pass rate → Archive.',
  conditions: [{ field: 'gate', op: 'equals', value: 'TEST' }],
  bulletTemplate: 'TEST-CONTAINER-TUI: Follow 12-step protocol. No opencode run, no scripts, no text matching.',
  warheadTemplate: 'Container TUI testing is the GOLD STANDARD for runtime verification. Follow all 12 steps.',
  evidenceSpec: { id: 'container-test', verify: 'container-tui-test', minQuality: 0.96 },
  severity: 'block',
  layer: 5,
  links: ['FX-13-FIX-OPENCODE-RUN', 'FX-14-FIX-DIRECT-SCRIPT', 'FX-15-FIX-STATIC-GREP'],
  selfVerified: true,
};

export const TEST_FORBIDDEN_METHODS: KnowledgeNode = {
  id: 'TEST-FORBIDDEN-METHODS',
  source: 'alg-sys',
  sourceFile: 'RUNTIME_GRADE_CONTAINER_TESTING_BIBLE.md',
  category: 'testing',
  rule: [
    'FORBIDDEN TESTING METHODS: These methods are banned for runtime testing.',
    '1. opencode run — not a real TUI interaction.',
    '2. node -e / require() — direct execution, not TUI.',
    '3. Static grep on bundles — does not prove runtime behavior.',
    '4. Text matching ("who are you") — can be spoofed, tests nothing.',
    '5. Identity spoofing — hardcoded responses are not real behavior.',
    '6. Mock/stub in production code — not a real test.',
    'Use: Container TUI 12-step protocol with tmux send-keys.',
  ].join('\n'),
  detectionMethod: 'Scan test code for forbidden patterns: opencode run, node -e, require(), grep on .js, text matching.',
  fixTemplate: 'Replace all forbidden methods with container TUI testing per 12-step protocol.',
  conditions: [{ field: 'gate', op: 'equals', value: 'TEST' }],
  bulletTemplate: 'TEST-FORBIDDEN: Using banned testing method. Replace with container TUI protocol.',
  warheadTemplate: 'Forbidden testing methods produce false evidence. Use container TUI testing.',
  evidenceSpec: { id: 'no-forbidden-methods', verify: 'sre-audit', minQuality: 0.99 },
  severity: 'block',
  layer: 4,
  links: ['AP-OPENCODE-RUN', 'AP-DIRECT-SCRIPT', 'AP-STATIC-GREP', 'AP-TEXT-MATCHING'],
  selfVerified: true,
};

export const TEST_EVIDENCE_REQUIREMENTS: KnowledgeNode = {
  id: 'TEST-EVIDENCE-REQUIREMENTS',
  source: 'alg-sys',
  sourceFile: 'RUNTIME_GRADE_CONTAINER_TESTING_BIBLE.md',
  category: 'testing',
  rule: [
    'TEST EVIDENCE REQUIREMENTS: What must be produced for the TEST gate.',
    '1. container-test: ContainerTestResult.json with pass rate >= 96%',
    '2. unit-test: Test runner exit code 0 with pass count. Pass rate >= 80%.',
    '3. browser-test: Browser test results. Pass rate >= 70%.',
    'All evidence must be mechanically produced and stored on filesystem.',
    'Agent claims of "tests pass" are NOT evidence. Exit codes and pass counts are.',
  ].join('\n'),
  detectionMethod: 'Verify ContainerTestResult.json exists with passRate >= 0.96. Verify unit test exit code 0.',
  fixTemplate: 'Run container TUI test → generate ContainerTestResult.json → verify pass rate → run unit tests → verify exit code.',
  conditions: [{ field: 'gate', op: 'equals', value: 'TEST' }],
  bulletTemplate: 'TEST-EVIDENCE: Need ContainerTestResult.json (>=96%) + unit test exit 0 (>=80%).',
  warheadTemplate: 'Test evidence is mechanical. Produce ContainerTestResult.json and unit test results.',
  evidenceSpec: { id: 'test-evidence', verify: 'test-run', minQuality: 0.96 },
  severity: 'block',
  layer: 5,
  links: ['TEST-CONTAINER-TUI', 'IL10-EVIDENCE-IS-MECHANICAL', 'IL15-EVIDENCE-TRIPLE-RULE'],
  selfVerified: true,
};

export const TEST_MECHANICAL_VERIFICATION: KnowledgeNode = {
  id: 'TEST-MECHANICAL-VERIFICATION',
  source: 'alg-sys',
  sourceFile: 'RUNTIME_GRADE_CONTAINER_TESTING_BIBLE.md',
  category: 'testing',
  rule: 'MECHANICAL VERIFICATION: Test results must be observable through mechanical means — exit codes, file outputs, state changes — not text output.',
  detectionMethod: 'Verify test assertions check mechanical behavior, not text matching.',
  fixTemplate: 'Assert on: exit codes, file existence, file content, state changes, error codes. NOT on text output.',
  conditions: [{ field: 'gate', op: 'equals', value: 'TEST' }],
  bulletTemplate: 'TEST-MECHANICAL: Verify behavior mechanically (exit codes, files), not via text matching.',
  warheadTemplate: 'Mechanical verification cannot be spoofed. Text matching can. Use mechanical checks.',
  evidenceSpec: { id: 'mechanical-test', verify: 'container-tui-test', minQuality: 0.96 },
  severity: 'block',
  layer: 5,
  links: ['TEST-CONTAINER-TUI', 'AP-TEXT-MATCHING'],
  selfVerified: true,
};

// ══ NEGATIVE TESTING ═══════════════════════════════════════════

export const TEST_NEGATIVE_INPUT: KnowledgeNode = {
  id: 'TEST-NEGATIVE-INPUT',
  source: 'alg-sys',
  sourceFile: 'KB-05_TESTING_STANDARDS.md',
  category: 'testing',
  rule: 'NEGATIVE TESTING — INVALID INPUTS: Test with invalid inputs (null, undefined, empty, wrong type, oversized). Verify proper error handling.',
  detectionMethod: 'Find test suites without negative input tests.',
  fixTemplate: 'Add tests: expect(() => fn(null)).toThrow(); expect(() => fn(undefined)).toThrow(); expect(() => fn("")).toThrow();',
  conditions: [{ field: 'gate', op: 'in', value: ['TEST', 'AUDIT'] }],
  bulletTemplate: 'TEST-NEGATIVE-INPUT: No invalid input tests. Add null/undefined/empty/wrong-type cases.',
  warheadTemplate: 'Negative testing verifies error handling. Test with invalid inputs.',
  evidenceSpec: { id: 'negative-input-tests', verify: 'test-run', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['TEST-NEGATIVE-BOUNDARY', 'TEST-NEGATIVE-CONCURRENCY', 'P3-ERROR-COMPLETENESS'],
  selfVerified: true,
};

export const TEST_NEGATIVE_BOUNDARY: KnowledgeNode = {
  id: 'TEST-NEGATIVE-BOUNDARY',
  source: 'alg-sys',
  sourceFile: 'KB-05_TESTING_STANDARDS.md',
  category: 'testing',
  rule: 'NEGATIVE TESTING — BOUNDARY CONDITIONS: Test at boundaries (0, -1, MAX_SAFE_INTEGER, empty array, single element).',
  detectionMethod: 'Find test suites without boundary condition tests.',
  fixTemplate: 'Add tests at boundaries: 0, -1, Number.MAX_SAFE_INTEGER, [], [single], Number.MAX_VALUE.',
  conditions: [{ field: 'gate', op: 'in', value: ['TEST', 'AUDIT'] }],
  bulletTemplate: 'TEST-NEGATIVE-BOUNDARY: No boundary tests. Add 0, -1, MAX, empty, single-element cases.',
  warheadTemplate: 'Boundary testing finds off-by-one errors and overflow bugs.',
  evidenceSpec: { id: 'boundary-tests', verify: 'test-run', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['TEST-NEGATIVE-INPUT', 'TEST-PROPERTY-BASED'],
  selfVerified: true,
};

export const TEST_NEGATIVE_ERROR: KnowledgeNode = {
  id: 'TEST-NEGATIVE-ERROR',
  source: 'alg-sys',
  sourceFile: 'KB-05_TESTING_STANDARDS.md',
  category: 'testing',
  rule: 'NEGATIVE TESTING — ERROR PATHS: Test that error paths produce correct errors with context.',
  detectionMethod: 'Find test suites without error path tests.',
  fixTemplate: 'Add tests: mock failure → verify error message contains context → verify recovery/fallback.',
  conditions: [{ field: 'gate', op: 'in', value: ['TEST', 'AUDIT'] }],
  bulletTemplate: 'TEST-NEGATIVE-ERROR: No error path tests. Add mock failure + error context verification.',
  warheadTemplate: 'Error path testing verifies that failures are handled gracefully.',
  evidenceSpec: { id: 'error-path-tests', verify: 'test-run', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['TEST-NEGATIVE-INPUT', 'P3-ERROR-COMPLETENESS'],
  selfVerified: true,
};

export const TEST_NEGATIVE_SECURITY: KnowledgeNode = {
  id: 'TEST-NEGATIVE-SECURITY',
  source: 'alg-sys',
  sourceFile: 'KB-05_TESTING_STANDARDS.md',
  category: 'testing',
  rule: 'NEGATIVE TESTING — SECURITY: Test with injection attempts, oversized payloads, malicious patterns.',
  detectionMethod: 'Find test suites without security-related negative tests.',
  fixTemplate: 'Add tests: SQL injection strings, XSS payloads, oversized inputs, path traversal attempts.',
  conditions: [{ field: 'gate', op: 'in', value: ['TEST', 'AUDIT'] }],
  bulletTemplate: 'TEST-NEGATIVE-SECURITY: No security tests. Add injection, XSS, path traversal cases.',
  warheadTemplate: 'Security testing verifies resilience against adversarial inputs.',
  evidenceSpec: { id: 'security-tests', verify: 'test-run', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['TEST-NEGATIVE-INPUT', 'SEC-PROMPT-INJECTION'],
  selfVerified: true,
};

export const TEST_NEGATIVE_CONCURRENCY: KnowledgeNode = {
  id: 'TEST-NEGATIVE-CONCURRENCY',
  source: 'alg-sys',
  sourceFile: 'KB-05_TESTING_STANDARDS.md',
  category: 'testing',
  rule: 'NEGATIVE TESTING — CONCURRENCY: Test race conditions, concurrent access, timing-dependent failures.',
  detectionMethod: 'Find test suites without concurrency tests.',
  fixTemplate: 'Add tests: Promise.all with same resource, concurrent writes, timing-dependent assertions.',
  conditions: [{ field: 'gate', op: 'in', value: ['TEST', 'AUDIT'] }],
  bulletTemplate: 'TEST-NEGATIVE-CONCURRENCY: No concurrency tests. Add race condition and concurrent access tests.',
  warheadTemplate: 'Concurrency testing verifies thread safety and race condition handling.',
  evidenceSpec: { id: 'concurrency-tests', verify: 'test-run', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['TEST-NEGATIVE-INPUT', 'CONC-ACTOR-MODEL'],
  selfVerified: true,
};

// ══ CONFIG DIFF ENFORCEMENT ════════════════════════════════════

export const TEST_CONFIG_DIFF: KnowledgeNode = {
  id: 'TEST-CONFIG-DIFF',
  source: 'alg-sys',
  sourceFile: 'KB-05_TESTING_STANDARDS.md',
  category: 'testing',
  rule: 'CONFIG DIFF ENFORCEMENT: Compare declared config (tsconfig, package.json) against runtime config. No drift.',
  detectionMethod: 'Read tsconfig.json compilerOptions. Compare against runtime program options. Flag mismatches.',
  fixTemplate: 'Validate at startup: if (program.getCompilerOptions().target !== declaredTarget) throw new Error("config drift");',
  conditions: [{ field: 'gate', op: 'in', value: ['VERIFY', 'TEST', 'AUDIT'] }],
  bulletTemplate: 'TEST-CONFIG-DIFF: Config drift between declared and runtime. Synchronize.',
  warheadTemplate: 'Config drift causes "works on my machine" bugs. Verify config consistency.',
  evidenceSpec: { id: 'config-consistent', verify: 'fs-check', minQuality: 0.95 },
  severity: 'warn',
  layer: 2,
  links: ['FM-16-CONFIG-DRIFT', 'P8-CONFIG-VALIDATION'],
  selfVerified: true,
};

// ══ DIFFERENTIAL TESTING ═══════════════════════════════════════

export const TEST_DIFFERENTIAL: KnowledgeNode = {
  id: 'TEST-DIFFERENTIAL',
  source: 'alg-sys',
  sourceFile: 'KB-05_TESTING_STANDARDS.md',
  category: 'testing',
  rule: 'DIFFERENTIAL TESTING: Compare output of two implementations on same inputs. Differences indicate bugs.',
  detectionMethod: 'Find test suites that could benefit from differential testing (multiple implementations of same spec).',
  fixTemplate: 'const ref = referenceImpl(input); const actual = myImpl(input); expect(actual).toEqual(ref);',
  conditions: [{ field: 'gate', op: 'in', value: ['TEST', 'AUDIT'] }],
  bulletTemplate: 'TEST-DIFFERENTIAL: No differential tests. Compare against reference implementation.',
  warheadTemplate: 'Differential testing catches subtle bugs by comparing implementations.',
  evidenceSpec: { id: 'differential-tests', verify: 'test-run', minQuality: 0.90 },
  severity: 'guide',
  layer: 4,
  links: ['TEST-PROPERTY-BASED', 'TEST-METAMORPHIC'],
  selfVerified: true,
};

// ══ METAMORPHIC TESTING ════════════════════════════════════════

export const TEST_METAMORPHIC: KnowledgeNode = {
  id: 'TEST-METAMORPHIC',
  source: 'alg-sys',
  sourceFile: 'KB-05_TESTING_STANDARDS.md',
  category: 'testing',
  rule: 'METAMORPHIC TESTING: Test metamorphic relations — properties that hold across transformations of inputs.',
  detectionMethod: 'Find test suites without metamorphic relation tests.',
  fixTemplate: 'const r1 = fn(x); const r2 = fn(transform(x)); assert(metamorphicRelation(r1, r2));',
  conditions: [{ field: 'gate', op: 'in', value: ['TEST', 'AUDIT'] }],
  bulletTemplate: 'TEST-METAMORPHIC: No metamorphic relation tests. Add transformation-invariant assertions.',
  warheadTemplate: 'Metamorphic testing finds bugs in functions without known expected outputs.',
  evidenceSpec: { id: 'metamorphic-tests', verify: 'test-run', minQuality: 0.90 },
  severity: 'guide',
  layer: 4,
  links: ['TEST-PROPERTY-BASED', 'TEST-DIFFERENTIAL'],
  selfVerified: true,
};

// ══ FLAKY TEST DETECTION ═══════════════════════════════════════

export const TEST_FLAKY_DETECTION: KnowledgeNode = {
  id: 'TEST-FLAKY-DETECTION',
  source: 'alg-sys',
  sourceFile: 'KB-05_TESTING_STANDARDS.md',
  category: 'testing',
  rule: 'FLAKY TEST DETECTION: Use Wilson score interval to identify tests that pass/fail inconsistently. Threshold: lower Wilson bound < 0.95.',
  detectionMethod: 'Run each test 10+ times. Compute Wilson score interval. Flag tests with lower bound < 0.95.',
  fixTemplate: 'Compute: wilsonScore = (p + z²/(2n) ± z*sqrt(p(1-p)/n + z²/(4n²))) / (1 + z²/n). Flag if lower < 0.95.',
  conditions: [{ field: 'gate', op: 'in', value: ['TEST', 'AUDIT'] }],
  bulletTemplate: 'TEST-FLAKY: Test has Wilson lower bound < 0.95. Fix or quarantine flaky test.',
  warheadTemplate: 'Flaky tests erode confidence in the entire test suite. Use Wilson score to detect them.',
  evidenceSpec: { id: 'no-flaky-tests', verify: 'test-run', minQuality: 0.95 },
  severity: 'warn',
  layer: 4,
  links: ['TEST-COVERAGE-THRESHOLD'],
  selfVerified: true,
};

// ══ ADDITIONAL TESTING NODES ═══════════════════════════════════

export const TEST_SNAPSHOT_DISCIPLINE: KnowledgeNode = {
  id: 'TEST-SNAPSHOT-DISCIPLINE',
  source: 'alg-sys',
  sourceFile: 'KB-05_TESTING_STANDARDS.md',
  category: 'testing',
  rule: 'SNAPSHOT DISCIPLINE: Snapshots must be reviewed manually. Auto-updating snapshots hides regressions.',
  detectionMethod: 'Find snapshot tests. Verify snapshots are reviewed, not blindly updated.',
  fixTemplate: 'Never use --updateSnapshot without reviewing the diff. Snapshots encode expected behavior.',
  conditions: [{ field: 'gate', op: 'in', value: ['TEST', 'AUDIT'] }],
  bulletTemplate: 'TEST-SNAPSHOT: Snapshot auto-updated without review. Review diff manually.',
  warheadTemplate: 'Snapshots are brittle. Review every update. Never blindly accept.',
  evidenceSpec: { id: 'snapshot-reviewed', verify: 'test-run', minQuality: 0.90 },
  severity: 'guide',
  layer: 4,
  links: [],
  selfVerified: true,
};

export const TEST_INTEGRATION_BOUNDARY: KnowledgeNode = {
  id: 'TEST-INTEGRATION-BOUNDARY',
  source: 'alg-sys',
  sourceFile: 'KB-05_TESTING_STANDARDS.md',
  category: 'testing',
  rule: 'INTEGRATION BOUNDARY: Integration tests must test at real boundaries (API, DB, filesystem), not mocked ones.',
  detectionMethod: 'Find integration tests with mocked boundaries. Flag if boundary is mocked instead of real.',
  fixTemplate: 'Use real filesystem, real database (test DB), real HTTP for integration tests. Mock only external paid services.',
  conditions: [{ field: 'gate', op: 'in', value: ['TEST', 'AUDIT'] }],
  bulletTemplate: 'TEST-INTEGRATION: Mocked boundary in integration test. Use real filesystem/DB/HTTP.',
  warheadTemplate: 'Integration tests must exercise real boundaries. Mocked integration tests are fake tests.',
  evidenceSpec: { id: 'integration-real', verify: 'test-run', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['AP-FAKE-TEST', 'AP-MOCK-IN-PRODUCTION'],
  selfVerified: true,
};

export const TEST_TEST_ISOLATION: KnowledgeNode = {
  id: 'TEST-ISOLATION',
  source: 'alg-sys',
  sourceFile: 'KB-05_TESTING_STANDARDS.md',
  category: 'testing',
  rule: 'TEST ISOLATION: Each test must be independent. No shared mutable state between tests.',
  detectionMethod: 'Find tests that share mutable state (global variables, shared objects).',
  fixTemplate: 'Use beforeEach/afterEach to reset state. No global mutable variables in tests.',
  conditions: [{ field: 'gate', op: 'in', value: ['TEST', 'AUDIT'] }],
  bulletTemplate: 'TEST-ISOLATION: Tests share mutable state. Use beforeEach to reset.',
  warheadTemplate: 'Test isolation ensures tests can run in any order without interference.',
  evidenceSpec: { id: 'test-isolated', verify: 'test-run', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: [],
  selfVerified: true,
};

export const TEST_ASSERTION_QUALITY: KnowledgeNode = {
  id: 'TEST-ASSERTION-QUALITY',
  source: 'alg-sys',
  sourceFile: 'KB-05_TESTING_STANDARDS.md',
  category: 'testing',
  rule: 'ASSERTION QUALITY: Every test must have meaningful assertions. A test with no assertions is not a test.',
  detectionMethod: 'Find test functions with no expect/assert calls.',
  fixTemplate: 'Add assertions: expect(result).toBeDefined(); expect(result.value).toBe(expected);',
  conditions: [{ field: 'gate', op: 'in', value: ['TEST', 'AUDIT'] }],
  bulletTemplate: 'TEST-ASSERTION: Test has no assertions. Add meaningful expect() calls.',
  warheadTemplate: 'A test without assertions is not a test. Every test must verify an outcome.',
  evidenceSpec: { id: 'has-assertions', verify: 'test-run', minQuality: 0.95 },
  severity: 'warn',
  layer: 4,
  links: ['AP-FAKE-TEST'],
  selfVerified: true,
};

export const TEST_PERFORMANCE_BUDGET: KnowledgeNode = {
  id: 'TEST-PERFORMANCE-BUDGET',
  source: 'alg-sys',
  sourceFile: 'KB-05_TESTING_STANDARDS.md',
  category: 'testing',
  rule: 'PERFORMANCE BUDGET: Tests must complete within time budget. Unit tests < 100ms each. Integration < 5s each.',
  detectionMethod: 'Measure test execution time. Flag tests exceeding budget.',
  fixTemplate: 'Optimize slow tests. Reduce setup overhead. Mock expensive operations in unit tests.',
  conditions: [{ field: 'gate', op: 'in', value: ['TEST'] }],
  bulletTemplate: 'TEST-PERFORMANCE: Test exceeds time budget ({duration}ms). Optimize.',
  warheadTemplate: 'Slow tests discourage running the suite. Keep unit tests under 100ms.',
  evidenceSpec: { id: 'test-performance', verify: 'test-run', minQuality: 0.90 },
  severity: 'guide',
  layer: 4,
  links: [],
  selfVerified: true,
};

export const TEST_TEARDOWN_COMPLETENESS: KnowledgeNode = {
  id: 'TEST-TEARDOWN-COMPLETENESS',
  source: 'alg-sys',
  sourceFile: 'KB-05_TESTING_STANDARDS.md',
  category: 'testing',
  rule: 'TEARDOWN COMPLETENESS: afterEach/afterAll must clean up all resources created in beforeEach/beforeAll.',
  detectionMethod: 'Find beforeEach that creates resources. Check afterEach cleans them up.',
  fixTemplate: 'beforeEach: create resource. afterEach: destroy resource. Balanced 1:1.',
  conditions: [{ field: 'gate', op: 'in', value: ['TEST', 'AUDIT'] }],
  bulletTemplate: 'TEST-TEARDOWN: Missing afterEach cleanup for beforeEach resource.',
  warheadTemplate: 'Incomplete teardown causes test pollution and flaky tests.',
  evidenceSpec: { id: 'teardown-complete', verify: 'test-run', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['P4-RESOURCE-LIFECYCLE'],
  selfVerified: true,
};

export const TEST_DETERMINISM: KnowledgeNode = {
  id: 'TEST-DETERMINISM',
  source: 'alg-sys',
  sourceFile: 'KB-05_TESTING_STANDARDS.md',
  category: 'testing',
  rule: 'TEST DETERMINISM: Tests must produce the same result every time. No Date.now(), no Math.random() without seeding.',
  detectionMethod: 'Find tests using Date.now(), Math.random(), or other non-deterministic APIs without seeding.',
  fixTemplate: 'Seed random: use deterministic PRNG. Mock Date.now(): use fixed timestamps. No real timers.',
  conditions: [{ field: 'gate', op: 'in', value: ['TEST', 'AUDIT'] }],
  bulletTemplate: 'TEST-DETERMINISM: Non-deterministic API ({api}) in test. Seed or mock it.',
  warheadTemplate: 'Non-deterministic tests are flaky. Seed randomness, mock time.',
  evidenceSpec: { id: 'test-deterministic', verify: 'test-run', minQuality: 0.95 },
  severity: 'warn',
  layer: 4,
  links: ['TEST-FLAKY-DETECTION'],
  selfVerified: true,
};

export const TEST_DATA_FACTORIES: KnowledgeNode = {
  id: 'TEST-DATA-FACTORIES',
  source: 'alg-sys',
  sourceFile: 'KB-05_TESTING_STANDARDS.md',
  category: 'testing',
  rule: 'TEST DATA FACTORIES: Use factory functions for test data, not hardcoded literals. Ensures consistency and maintainability.',
  detectionMethod: 'Find tests with hardcoded object literals repeated across multiple tests.',
  fixTemplate: 'function makeUser(overrides: Partial<User> = {}): User { return { id: 1, name: "test", ...overrides }; }',
  conditions: [{ field: 'gate', op: 'in', value: ['TEST'] }],
  bulletTemplate: 'TEST-DATA-FACTORIES: Hardcoded test data. Use factory function.',
  warheadTemplate: 'Factory functions make test data consistent and easy to maintain.',
  evidenceSpec: { id: 'data-factories', verify: 'test-run', minQuality: 0.90 },
  severity: 'guide',
  layer: 4,
  links: [],
  selfVerified: true,
};

export const TEST_ERROR_MESSAGE_QUALITY: KnowledgeNode = {
  id: 'TEST-ERROR-MSG-QUALITY',
  source: 'alg-sys',
  sourceFile: 'KB-05_TESTING_STANDARDS.md',
  category: 'testing',
  rule: 'ERROR MESSAGE QUALITY: Test error messages must explain WHAT failed and WHY, not just "assertion failed".',
  detectionMethod: 'Find tests with generic assertion messages or no messages.',
  fixTemplate: 'expect(result).toBe(expected); // BAD\nexpect(result).toBe(expected); // message: "Should return expected for input X"',
  conditions: [{ field: 'gate', op: 'in', value: ['TEST'] }],
  bulletTemplate: 'TEST-ERROR-MSG: Generic assertion message. Add descriptive failure message.',
  warheadTemplate: 'Good error messages make test failures immediately diagnosable.',
  evidenceSpec: { id: 'error-msg-quality', verify: 'test-run', minQuality: 0.90 },
  severity: 'guide',
  layer: 4,
  links: [],
  selfVerified: true,
};

// ══ ADVANCED TESTING TYPES (10 nodes) ═══════════════════════════

export const TEST_FUZZ_TESTING: KnowledgeNode = {
  id: 'TEST-FUZZ-TESTING',
  source: 'alg-sys',
  sourceFile: 'KB-05_TESTING_STANDARDS.md',
  category: 'testing',
  rule: 'FUZZ TESTING: Generate random, malformed, and adversarial inputs to find crashes, panics, and unhandled edge cases.',
  detectionMethod: 'Find test suites with no fuzz testing for input-parsing functions. Flag parsers without fuzz coverage.',
  fixTemplate: 'import { fuzz } from "fuzzball"; fuzz(fn, { iterations: 10000, inputs: genAdversarial() });',
  conditions: [{ field: 'gate', op: 'in', value: ['TEST', 'AUDIT'] }],
  bulletTemplate: 'TEST-FUZZ-TESTING: No fuzz tests for input handling. Add random and adversarial input fuzzing.',
  warheadTemplate: 'Fuzz testing finds crashes that structured tests miss by exploring the input space.',
  evidenceSpec: { id: 'fuzz-tests', verify: 'test-run', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['TEST-PROPERTY-BASED', 'SEC-REDTIME-FUZZ', 'TEST-NEGATIVE-INPUT'],
  selfVerified: true,
};

export const TEST_REGRESSION_TESTING: KnowledgeNode = {
  id: 'TEST-REGRESSION-TESTING',
  source: 'alg-sys',
  sourceFile: 'KB-05_TESTING_STANDARDS.md',
  category: 'testing',
  rule: 'REGRESSION TESTING: Every bug fix must include a test that reproduces the original bug, preventing it from returning.',
  detectionMethod: 'Find bug fixes without a corresponding regression test in the same PR.',
  fixTemplate: 'Write a test that fails before the fix and passes after. Name it after the bug: test_bug_xyz_description().',
  conditions: [{ field: 'gate', op: 'in', value: ['TEST', 'AUDIT'] }],
  bulletTemplate: 'TEST-REGRESSION-TESTING: Bug fix without regression test. Add a test that reproduces the bug.',
  warheadTemplate: 'Regression tests prevent fixed bugs from silently returning.',
  evidenceSpec: { id: 'regression-tests', verify: 'test-run', minQuality: 0.95 },
  severity: 'warn',
  layer: 4,
  links: ['TEST-MUTATION-THRESHOLD', 'TEST-NEGATIVE-ERROR'],
  selfVerified: true,
};

export const TEST_SMOKE_TESTING: KnowledgeNode = {
  id: 'TEST-SMOKE-TESTING',
  source: 'alg-sys',
  sourceFile: 'KB-05_TESTING_STANDARDS.md',
  category: 'testing',
  rule: 'SMOKE TESTING: A minimal set of tests that verify the system starts and core paths work — if these fail, stop immediately.',
  detectionMethod: 'Find deployments without smoke tests. Flag CI pipelines with no post-deploy verification.',
  fixTemplate: 'Add smoke tests: health check, auth login, core API call. Run after every deploy.',
  conditions: [{ field: 'gate', op: 'in', value: ['TEST', 'DELIVERY'] }],
  bulletTemplate: 'TEST-SMOKE-TESTING: No smoke tests after deploy. Add health + core-path verification.',
  warheadTemplate: 'Smoke tests catch deployment failures before users do.',
  evidenceSpec: { id: 'smoke-tests', verify: 'test-run', minQuality: 0.95 },
  severity: 'warn',
  layer: 4,
  links: ['DOMAIN-ORCH-HEALTH-CHECK', 'TEST-EVIDENCE-REQUIREMENTS'],
  selfVerified: true,
};

export const TEST_INTEGRATION_TESTING: KnowledgeNode = {
  id: 'TEST-INTEGRATION-TESTING',
  source: 'alg-sys',
  sourceFile: 'KB-05_TESTING_STANDARDS.md',
  category: 'testing',
  rule: 'INTEGRATION TESTING: Test the interaction between modules/services at real boundaries (DB, API, filesystem) — not mocked.',
  detectionMethod: 'Find integration tests that mock the boundary under test instead of using the real system.',
  fixTemplate: 'Use real DB (test instance), real HTTP (test server), real filesystem. Mock only external paid services.',
  conditions: [{ field: 'gate', op: 'in', value: ['TEST', 'AUDIT'] }],
  bulletTemplate: 'TEST-INTEGRATION-TESTING: Integration tests with mocked boundaries. Use real systems.',
  warheadTemplate: 'Integration tests verify real inter-module communication — mocked boundaries are fake tests.',
  evidenceSpec: { id: 'integration-tests', verify: 'test-run', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['TEST-INTEGRATION-BOUNDARY', 'AP-MOCK-IN-PRODUCTION'],
  selfVerified: true,
};

export const TEST_E2E_TESTING: KnowledgeNode = {
  id: 'TEST-E2E-TESTING',
  source: 'alg-sys',
  sourceFile: 'KB-05_TESTING_STANDARDS.md',
  category: 'testing',
  rule: 'END-TO-END (E2E) TESTING: Test the full user journey from UI to DB to verify the entire system works together.',
  detectionMethod: 'Find systems with no E2E test for critical user paths (signup, checkout, core feature).',
  fixTemplate: 'Use Playwright/Cypress. Write E2E tests for each critical user journey. Run in CI.',
  conditions: [{ field: 'gate', op: 'in', value: ['TEST', 'AUDIT'] }],
  bulletTemplate: 'TEST-E2E-TESTING: No E2E tests for critical paths. Add full-journey tests.',
  warheadTemplate: 'E2E tests verify the complete system works from the user\'s perspective.',
  evidenceSpec: { id: 'e2e-tests', verify: 'test-run', minQuality: 0.85 },
  severity: 'warn',
  layer: 5,
  links: ['TEST-CONTAINER-TUI', 'TEST-INTEGRATION-TESTING'],
  selfVerified: true,
};

export const TEST_CONTRACT_TESTING: KnowledgeNode = {
  id: 'TEST-CONTRACT-TESTING',
  source: 'alg-sys',
  sourceFile: 'KB-05_TESTING_STANDARDS.md',
  category: 'testing',
  rule: 'CONTRACT TESTING: Verify that a service\'s API matches the contract its consumers expect (Pact, schema validation).',
  detectionMethod: 'Find service-to-service communication without contract tests. Flag APIs with no consumer-driven contract.',
  fixTemplate: 'Use Pact or schema-registry-based contracts. Verify provider meets consumer expectations on every change.',
  conditions: [{ field: 'gate', op: 'in', value: ['TEST', 'AUDIT'] }],
  bulletTemplate: 'TEST-CONTRACT-TESTING: No contract tests between services. Add consumer-driven contracts.',
  warheadTemplate: 'Contract tests prevent breaking API changes from reaching consumers.',
  evidenceSpec: { id: 'contract-tests', verify: 'test-run', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['DOMAIN-API-OPENAPI-SPEC', 'TEST-INTEGRATION-TESTING'],
  selfVerified: true,
};

export const TEST_SNAPSHOT_TESTING: KnowledgeNode = {
  id: 'TEST-SNAPSHOT-TESTING',
  source: 'alg-sys',
  sourceFile: 'KB-05_TESTING_STANDARDS.md',
  category: 'testing',
  rule: 'SNAPSHOT TESTING (ADVANCED): Snapshot tests compare output to a stored baseline. They are brittle — use for stable, serializable output only.',
  detectionMethod: 'Find snapshot tests on non-deterministic output (dates, random, order-dependent). Flag blindly updated snapshots.',
  fixTemplate: 'Use snapshots only for stable output. Strip dynamic fields (timestamps, IDs) before snapshotting. Review every diff.',
  conditions: [{ field: 'gate', op: 'in', value: ['TEST', 'AUDIT'] }],
  bulletTemplate: 'TEST-SNAPSHOT-TESTING: Snapshot on non-deterministic output or blind updates. Stabilize and review.',
  warheadTemplate: 'Snapshots hide regressions when blindly updated. Stabilize and review every diff.',
  evidenceSpec: { id: 'snapshot-advanced', verify: 'test-run', minQuality: 0.85 },
  severity: 'warn',
  layer: 4,
  links: ['TEST-SNAPSHOT-DISCIPLINE', 'TEST-DETERMINISM'],
  selfVerified: true,
};

export const TEST_GOLDEN_MASTER: KnowledgeNode = {
  id: 'TEST-GOLDEN-MASTER',
  source: 'alg-sys',
  sourceFile: 'KB-05_TESTING_STANDARDS.md',
  category: 'testing',
  rule: 'GOLDEN MASTER TESTING: Compare current output against a known-good "golden" output. Useful for refactoring legacy code without tests.',
  detectionMethod: 'Find complex functions being refactored without a golden master test to catch behavioral changes.',
  fixTemplate: 'Capture current output as golden master. After refactor, compare output to golden master. Any diff = regression.',
  conditions: [{ field: 'gate', op: 'in', value: ['TEST', 'AUDIT'] }],
  bulletTemplate: 'TEST-GOLDEN-MASTER: Refactoring without characterization tests. Add golden master comparison.',
  warheadTemplate: 'Golden master tests enable safe refactoring of untested legacy code.',
  evidenceSpec: { id: 'golden-master', verify: 'test-run', minQuality: 0.90 },
  severity: 'guide',
  layer: 4,
  links: ['TEST-DIFFERENTIAL', 'TEST-SNAPSHOT-TESTING'],
  selfVerified: true,
};

export const TEST_CHAOS_TESTING: KnowledgeNode = {
  id: 'TEST-CHAOS-TESTING',
  source: 'alg-sys',
  sourceFile: 'KB-05_TESTING_STANDARDS.md',
  category: 'testing',
  rule: 'CHAOS TESTING: Deliberately inject failures (kill instances, add latency, drop network) to verify the system is resilient.',
  detectionMethod: 'Find distributed systems without chaos testing. Flag missing failure-injection experiments.',
  fixTemplate: 'Use chaos engineering tools. Inject: instance kill, network partition, latency spike, disk full. Verify recovery.',
  conditions: [{ field: 'gate', op: 'in', value: ['TEST', 'AUDIT'] }],
  bulletTemplate: 'TEST-CHAOS-TESTING: No failure injection experiments. Add chaos tests for resilience.',
  warheadTemplate: 'Chaos testing finds resilience weaknesses before production failures do.',
  evidenceSpec: { id: 'chaos-tests', verify: 'test-run', minQuality: 0.80 },
  severity: 'guide',
  layer: 5,
  links: ['DOMAIN-ORCH-CIRCUIT-BREAKER', 'DOMAIN-ORCH-DEAD-LETTER', 'ARCH-BULKHEAD'],
  selfVerified: true,
};

export const TEST_LOAD_TESTING: KnowledgeNode = {
  id: 'TEST-LOAD-TESTING',
  source: 'alg-sys',
  sourceFile: 'KB-05_TESTING_STANDARDS.md',
  category: 'testing',
  rule: 'LOAD TESTING: Simulate production-level traffic to find performance bottlenecks, memory leaks, and concurrency issues.',
  detectionMethod: 'Find systems with no load testing before launch. Flag missing performance baselines.',
  fixTemplate: 'Use k6, Artillery, or Locust. Test at 1x, 5x, and 10x expected peak. Measure latency p99, error rate, throughput.',
  conditions: [{ field: 'gate', op: 'in', value: ['TEST', 'AUDIT'] }],
  bulletTemplate: 'TEST-LOAD-TESTING: No load tests before launch. Simulate peak traffic and measure.',
  warheadTemplate: 'Load testing finds bottlenecks and leaks that unit tests cannot.',
  evidenceSpec: { id: 'load-tests', verify: 'test-run', minQuality: 0.85 },
  severity: 'warn',
  layer: 4,
  links: ['TEST-PERFORMANCE-BUDGET', 'DOMAIN-ORCH-OBSERVABILITY'],
  selfVerified: true,
};

// EXPORTS
export const testingNodes: KnowledgeNode[] = [
  TEST_PROPERTY_BASED, TEST_MUTATION_THRESHOLD, TEST_COVERAGE_THRESHOLD,
  TEST_CONTAINER_TUI, TEST_FORBIDDEN_METHODS, TEST_EVIDENCE_REQUIREMENTS,
  TEST_MECHANICAL_VERIFICATION,
  TEST_NEGATIVE_INPUT, TEST_NEGATIVE_BOUNDARY, TEST_NEGATIVE_ERROR,
  TEST_NEGATIVE_SECURITY, TEST_NEGATIVE_CONCURRENCY,
  TEST_CONFIG_DIFF, TEST_DIFFERENTIAL, TEST_METAMORPHIC, TEST_FLAKY_DETECTION,
  TEST_SNAPSHOT_DISCIPLINE, TEST_INTEGRATION_BOUNDARY, TEST_TEST_ISOLATION,
  TEST_ASSERTION_QUALITY, TEST_PERFORMANCE_BUDGET, TEST_TEARDOWN_COMPLETENESS,
  TEST_DETERMINISM, TEST_DATA_FACTORIES, TEST_ERROR_MESSAGE_QUALITY,
  // Advanced Testing Types
  TEST_FUZZ_TESTING, TEST_REGRESSION_TESTING, TEST_SMOKE_TESTING,
  TEST_INTEGRATION_TESTING, TEST_E2E_TESTING, TEST_CONTRACT_TESTING,
  TEST_SNAPSHOT_TESTING, TEST_GOLDEN_MASTER, TEST_CHAOS_TESTING, TEST_LOAD_TESTING,
];
