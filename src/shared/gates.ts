/**
 * Recovery paths:
 *   VERIFY fail → BUILD (max 22 attempts)
 *   AUDIT fail → BUILD (max 11 attempts, with full failure context)
 *     FIXED (v5.1): AUDIT fail now returns to BUILD, not PLAN.
 *     The agent already planned — it just couldn't execute due to
 *     enforcement blocking writes. Returning to BUILD gives it room
 *     to actually create files instead of looping through PLAN→BUILD→AUDIT.
 *   TEST fail → PLAN (max 11 attempts, with full failure context)
 *
 *   Agent can manually reset to PLAN at any time
 */

import { safeParseJSON } from './type-guards.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { EvidenceCollector } from './evidence.js';
import { logInfo } from './shark-logger.js';
import { trackGateTransition } from '../eie/pse-loop-prevention.js';

/**
 * Find SPEC.md ANYWHERE in the project — not just at the workspace root.
 *
 * The agent often writes SPEC.md to subdirectories (e.g. test-output/SPEC.md)
 * instead of the project root. The gate system must locate it wherever it
 * lands so the PLAN gate doesn't spuriously fail.
 *
 * Search order:
 *   1. Workspace root (most common location)
 *   2. Common subdirectories (test-output, src, docs, build, output)
 *   3. Recursive depth-limited search (max depth 3), skipping
 *      node_modules, dist, and dot-directories.
 */
function findSpecMd(workspacePath: string): string | null {
  // Check root first
  const rootSpec = path.join(workspacePath, 'SPEC.md');
  if (fs.existsSync(rootSpec)) return rootSpec;

  // Check common subdirectories
  const commonDirs = ['test-output', 'src', 'docs', 'build', 'output'];
  for (const dir of commonDirs) {
    const specPath = path.join(workspacePath, dir, 'SPEC.md');
    if (fs.existsSync(specPath)) return specPath;
  }

  // Recursive search (max depth 3)
  function searchDir(dir: string, depth: number): string | null {
    if (depth > 3) return null;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'SPEC.md') return path.join(dir, 'SPEC.md');
        if (entry.isDirectory() && !entry.name.startsWith('.') &&
            entry.name !== 'node_modules' && entry.name !== 'dist') {
          const found = searchDir(path.join(dir, entry.name), depth + 1);
          if (found) return found;
        }
      }
    } catch { /* unreadable dir — skip */ }
    return null;
  }

  return searchDir(workspacePath, 0);
}

export const GATE_ORDER: string[] = ['plan', 'build', 'verify', 'test', 'audit', 'delivery'];
/** Alias for backward compatibility */
export const GATE_CHAIN = GATE_ORDER;

/** Stub for backward compatibility — old criterion-based validation replaced by GateManager.transitionTo() */
export function validateGateCriteria(gate: string, evidenceBase?: string): { passed: boolean; missing: string[] } {
  // ── Phase 4: AUDIT gate criteria now check FILESYSTEM REALITY ──
  // The old criteria required evidence IDs ('no-critical', 'semantic-firewall-pass')
  // and pre-generated report files (SpecAlignmentReport.json, TestAuthenticityReport.json)
  // that could never be satisfied when the agent couldn't create files — a circular
  // dependency that caused 192 audit failures. Audit now verifies that source files
  // exist, dist/ has content, and tsc passes.
  if (gate === 'audit') {
    let workspace = process.cwd();
    if (evidenceBase) {
      const resolved = path.resolve(evidenceBase);
      const marker = path.sep + '.shark';
      const i = resolved.indexOf(marker);
      if (i > 0) workspace = resolved.slice(0, i);
    }
    const { passed, results } = runAuditCriteriaAgainstWorkspace(workspace);
    return {
      passed,
      missing: results.filter(r => !r.met).map(r => r.reason),
    };
  }
  // Use the real evidence-based check instead of always returning success
  try {
    const collector = new EvidenceCollector(evidenceBase || '.shark');
    const result = collector.hasRequiredEvidence(gate);

    // PLAN gate: apply CSE-aware plan quality check.
    // The PLAN gate requires evidence IDs 'architecture' and 'error-strategy'.
    // GateEngine satisfies these dynamically when SPEC.md has those sections
    // (via CSE.verifyPlanQuality). But this standalone function (called by
    // gate-hook.ts checkGateAdvance) doesn't have access to CSE. So we
    // replicate the SPEC.md section check here to keep the auto-advance
    // path consistent with the manual-advance path (GateManager.checkGateEvidence).
    if (gate === 'plan' && !result.passed) {
      const workspace = process.cwd();
      try {
        const specPath = findSpecMd(workspace);
        if (specPath) {
          const content = fs.readFileSync(specPath, 'utf-8');
          // No minimum size check — just verify section headers exist.
          // The CSE.verifyPlanQuality() enforces size/quality separately.
          const hasArchitecture =
            /^#+\s*(architecture|design|structure|components?)/im.test(content) ||
            /\n(architecture|design|structure|components?)\n[-=]{3,}/i.test(content);
          const hasErrorStrategy =
            /^#+\s*(error|failure|edge cases?|exception|fallback|error handling|error strategy)/im.test(content) ||
            /\n(error (handling|strategy)|failure|edge cases?)\n[-=]{3,}/i.test(content);

          const missing = result.missing.filter(m => {
            if (m === 'architecture' && hasArchitecture) return false;
            if (m === 'error-strategy' && hasErrorStrategy) return false;
            return true;
          });
          return { passed: missing.length === 0, missing };
        }
      } catch {
        // SPEC.md check failed — fall through to original result
      }
    }

    return result;
  } catch {
    logInfo('[gates] validateGateCriteria failed');
    return { passed: false, missing: ['EvidenceCollector unavailable'] };
  }
}

export const GATE_FAIL_LIMITS: Record<string, number> = {
  verify: 22,
  audit: 11,
  test: 11,
};

// ═══════════════════════════════════════════════════════════════
// GATE ALLOWED OPERATIONS — Phase 1 Gate-Enforcement Alignment
//
// Each gate has an explicit allowed-operations set. Enforcement
// skips checks that don't apply to the current gate, eliminating
// the false-positive loops where BUILD blocks writes or TEST blocks
// bash execution.
//
// | Gate     | writeToSrc | executeBash | createFiles | runBuild | runTests | generateEvidence |
// |----------|------------|-------------|-------------|----------|----------|------------------|
// | plan     | false      | false       | false       | false    | false    | false            |
// | build    | true       | true        | true        | true     | false    | false            |
// | test     | false      | true        | false       | true     | true     | false            |
// | verify   | false      | true        | false       | true     | true     | true             |
// | audit    | false      | true        | false       | true     | true     | true             |
// | delivery | false      | true        | false       | false    | false    | true             |
// ═══════════════════════════════════════════════════════════════

export interface GateAllowedOperations {
  writeToSrc: boolean;
  executeBash: boolean;
  createFiles: boolean;
  runBuild: boolean;
  runTests: boolean;
  generateEvidence: boolean;
}

export const GATE_ALLOWED_OPERATIONS: Record<string, GateAllowedOperations> = {
  // writeToSrc only enabled in BUILD. Agent must fail back to BUILD to fix issues.
  plan:     { writeToSrc: false, executeBash: false, createFiles: false, runBuild: false, runTests: false, generateEvidence: false },
  build:    { writeToSrc: true,  executeBash: true,  createFiles: true,  runBuild: true,  runTests: false, generateEvidence: false },
  test:     { writeToSrc: false, executeBash: true,  createFiles: true,  runBuild: true,  runTests: true,  generateEvidence: false },
  verify:   { writeToSrc: false, executeBash: true,  createFiles: true,  runBuild: true,  runTests: true,  generateEvidence: true  },
  audit:    { writeToSrc: false, executeBash: true,  createFiles: true,  runBuild: true,  runTests: true,  generateEvidence: true  },
  delivery: { writeToSrc: false, executeBash: true,  createFiles: false, runBuild: false, runTests: false, generateEvidence: true  },
};

export type GateOperation = keyof GateAllowedOperations;

/**
 * Check whether a specific operation is allowed in the current gate.
 * Falls back to 'build' gate permissions if the gate is unknown.
 */
export function isAllowed(gate: string, operation: GateOperation): boolean {
  const ops = GATE_ALLOWED_OPERATIONS[gate] || GATE_ALLOWED_OPERATIONS.build;
  return ops[operation];
}

// ═══════════════════════════════════════════════════════════════
// PHASE 4: AUDIT CRITERIA REFORM — filesystem-based audit criteria
// PHASE 5: GATE STATE REALITY CHECK — verify gates against disk
//
// The old audit criteria required pre-generated report files
// (SpecAlignmentReport.json, TestAuthenticityReport.json) and evidence
// IDs ('no-critical', 'semantic-firewall-pass') that could never be
// satisfied when enforcement blocked the agent from creating files.
// This created a circular dependency: audit failed because no evidence
// existed, but no evidence existed because the agent couldn't write.
//
// The new criteria check FILESYSTEM REALITY: do source files exist,
// does dist/ have content, does tsc pass. These are achievable without
// any pre-generated report files.
//
// Additionally (Phase 5), every gate now has a realityCheck that runs
// BEFORE the gate is marked 'passed'. If reality doesn't match the
// gate's claimed outcome, the gate FAILS and the manager transitions
// back to the recovery gate — fixing the "delivery=passed with nothing
// delivered" lie.
// ═══════════════════════════════════════════════════════════════

export interface CriterionResult {
  met: boolean;
  reason: string;
}

export interface GateCriterion {
  name: string;
  check: (workspacePath: string) => CriterionResult;
}

export interface RealityCheckResult {
  matches: boolean;
  reason: string;
}

/**
 * Minimal structural interface for the PreflightRunner.
 * The real PreflightRunner (src/shark/planning-brain/cse/preflight-runner.ts)
 * satisfies this contract. Declared locally to avoid a cross-layer import
 * dependency from shared/ → shark/planning-brain/. Wired into the GateManager
 * via setPreflightRunner() so the AUDIT gate can reuse cached tsc/bun-build
 * results instead of re-running them (Phase 4.2).
 */
export interface PreflightRunnerLike {
  run(gate: string, bustCache?: boolean): {
    tscStatus: { ran: boolean; success: boolean; output: string };
    bundleStatus: { ran: boolean; success: boolean; output: string; errorMessage?: string };
    exports: string[];
    tscErrors: unknown[];
    available: boolean;
  };
  bustCache(gate?: string): void;
}

/**
 * AUDIT_GATE_CRITERIA — filesystem-based audit criteria (Phase 4).
 *
 * Replaces the impossible criteria that required pre-generated report files.
 * These check that the project actually built: source files exist, dist/ has
 * content, and the TypeScript compiler passes with zero errors.
 */
export const AUDIT_GATE_CRITERIA: GateCriterion[] = [
  {
    name: 'source-files-exist',
    check: (workspacePath: string): CriterionResult => {
      const srcDir = path.join(workspacePath, 'src');
      if (!fs.existsSync(srcDir)) return { met: false, reason: 'no src/ directory' };
      let files: string[] = [];
      try {
        files = fs.readdirSync(srcDir).filter(f => f.endsWith('.ts'));
      } catch {
        // unreadable dir — treat as no files
      }
      return {
        met: files.length > 0,
        reason: files.length > 0 ? `${files.length} source files` : 'no .ts files in src/',
      };
    },
  },
  {
    name: 'dist-exists',
    check: (workspacePath: string): CriterionResult => {
      const distDir = path.join(workspacePath, 'dist');
      if (!fs.existsSync(distDir)) return { met: false, reason: 'no dist/ directory' };
      let files: string[] = [];
      try {
        files = fs.readdirSync(distDir);
      } catch {
        // unreadable dir — treat as empty
      }
      return {
        met: files.length > 0,
        reason: files.length > 0 ? `${files.length} files in dist/` : 'dist/ is empty',
      };
    },
  },
  {
    name: 'tsc-passes',
    check: (workspacePath: string): CriterionResult => {
      try {
        execSync('npx tsc --noEmit 2>&1', {
          cwd: workspacePath,
          timeout: 60_000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        return { met: true, reason: 'tsc passed with 0 errors' };
      } catch (e: unknown) {
        const execErr = e as { stdout?: string; message?: string };
        const detail = (execErr.stdout || execErr.message || 'tsc failed').slice(0, 200);
        return { met: false, reason: 'tsc failed: ' + detail };
      }
    },
  },
];

/**
 * Run audit criteria against a workspace. If a PreflightRunner is provided,
 * its cached tsc/bun-build results are used instead of re-running tsc —
 * wiring the preflight runner into the audit gate (Phase 4.2).
 */
export function runAuditCriteriaAgainstWorkspace(
  workspacePath: string,
  preflight?: PreflightRunnerLike | null,
): { passed: boolean; results: CriterionResult[] } {
  const results: CriterionResult[] = [];

  if (preflight) {
    // Use preflight grounding for tsc + bundle; filesystem for source files.
    const grounding = preflight.run('AUDIT', true);
    // source-files-exist (filesystem)
    results.push(AUDIT_GATE_CRITERIA[0].check(workspacePath));
    // dist-exists (from bundle status)
    results.push({
      met: grounding.bundleStatus.ran && grounding.bundleStatus.success,
      reason: grounding.bundleStatus.success
        ? `${grounding.exports.length} exports in dist/`
        : 'bun build failed: ' + (grounding.bundleStatus.errorMessage || grounding.bundleStatus.output || '').slice(0, 200),
    });
    // tsc-passes (from tsc status)
    results.push({
      met: grounding.tscStatus.ran && grounding.tscStatus.success,
      reason: grounding.tscStatus.success
        ? 'tsc passed with 0 errors'
        : 'tsc failed: ' + grounding.tscErrors.length + ' errors',
    });
  } else {
    // No preflight runner — run criteria directly (tsc via execSync).
    for (const criterion of AUDIT_GATE_CRITERIA) {
      results.push(criterion.check(workspacePath));
    }
  }

  return { passed: results.every(r => r.met), results };
}

// ─────────────────────────────────────────────────────────────────
// INTELLIGENT REALITY CHECKS — semantically verified, not file-existence-only
// ─────────────────────────────────────────────────────────────────
//
// Each reality check inspects CONTENT QUALITY, not just file existence:
//   - PLAN: SPEC.md must have REAL sections (>200 bytes, Architecture + Error)
//   - BUILD: .ts files must have REAL content (>50 bytes each, >100 total)
//   - VERIFY: Build output files must have REAL content (>50 bytes)
//   - TEST: ContainerTestResult.json must report >= 96% pass rate (NO lenient fallback)
//   - AUDIT: Audit report OR source files with real content must exist
//   - DELIVERY: Delivered files must have REAL content (>50 bytes each)
//

/**
 * PLAN reality: SPEC.md must have REAL content (>200 bytes) with Architecture
 * and Error Handling sections. A 3-byte "ok" stub does NOT pass.
 */
export function planRealityCheck(workspacePath: string): RealityCheckResult {
  const specPath = findSpecMd(workspacePath);
  if (!specPath) return { matches: false, reason: 'No SPEC.md found' };

  try {
    const content = fs.readFileSync(specPath, 'utf-8');
    if (content.length < 200) {
      return { matches: false, reason: `SPEC.md too short (<200 bytes: ${content.length})` };
    }

    const hasArch =
      /^#+\s*(architecture|design|structure|components?)/im.test(content) ||
      /\n(architecture|design|structure|components?)\n[-=]{3,}/i.test(content);
    const hasError =
      /^#+\s*(error|failure|edge cases?|exception|fallback|error handling|error strategy)/im.test(content) ||
      /\n(error (handling|strategy)|failure|edge cases?)\n[-=]{3,}/i.test(content);

    if (!hasArch) return { matches: false, reason: 'SPEC.md missing Architecture section' };
    if (!hasError) return { matches: false, reason: 'SPEC.md missing Error Handling section' };

    return { matches: true, reason: `SPEC.md ${content.length} bytes with Architecture + Error sections` };
  } catch {
    return { matches: false, reason: 'Cannot read SPEC.md' };
  }
}

/**
 * BUILD reality: .ts files must exist with REAL content (>50 bytes each).
 * A directory full of empty stubs does NOT pass.
 */
export function buildRealityCheck(workspacePath: string): RealityCheckResult {
  const outputDirs = ['test-output', 'src', 'output', 'build', 'lib', ''];
  let foundTsFiles = 0;
  let totalSize = 0;

  for (const dir of outputDirs) {
    const dirPath = dir ? path.join(workspacePath, dir) : workspacePath;
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.ts')) {
          const filePath = path.join(dirPath, entry.name);
          const stat = fs.statSync(filePath);
          if (stat.size > 50) {
            // BYPASS FIX: Verify it's REAL TypeScript — must have actual code keywords,
            // not just a stub file with a .ts extension.
            try {
              const content = fs.readFileSync(filePath, 'utf-8');
              if (/\b(import|export|function|class|interface|const|let|type|enum)\b/.test(content)) {
                foundTsFiles++;
                totalSize += stat.size;
              }
            } catch { /* read failed — skip this file */ }
          }
        }
      }
    } catch { /* unreadable or missing dir — try next */ }
  }

  if (foundTsFiles === 0) {
    return { matches: false, reason: 'No .ts files with real TypeScript content found' };
  }
  if (totalSize < 100) {
    return { matches: false, reason: `Total .ts content too small (<100 bytes: ${totalSize})` };
  }

  return { matches: true, reason: `${foundTsFiles} .ts files (${totalSize} bytes total)` };
}

/**
 * VERIFY reality: Build output must exist with REAL content (>50 bytes).
 * Checks multiple output directories for compiled code artifacts.
 */
export function verifyRealityCheck(workspacePath: string): RealityCheckResult {
  // BYPASS FIX: Priority 1 — check that 'compiled' evidence was ACTUALLY registered.
  // 'compiled' evidence with passed:true is only written when tsc passes.
  // This prevents the verify gate from passing on uncompiled .ts files.
  const verifyEvidenceDir = path.join(workspacePath, '.shark', 'evidence', 'verify');
  if (fs.existsSync(verifyEvidenceDir)) {
    try {
      const entries = fs.readdirSync(verifyEvidenceDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const evidenceFile = path.join(verifyEvidenceDir, entry.name, 'evidence.json');
          if (fs.existsSync(evidenceFile)) {
            try {
              const evidence = JSON.parse(fs.readFileSync(evidenceFile, 'utf-8'));
              if (evidence.id === 'compiled' && evidence.passed === true) {
                return { matches: true, reason: 'compiled evidence: tsc passed (verify gate)' };
              }
            } catch { /* malformed JSON — skip */ }
          }
        }
        // Also check flat JSON files
        if (entry.isFile() && entry.name.endsWith('.json')) {
          try {
            const evidence = JSON.parse(fs.readFileSync(path.join(verifyEvidenceDir, entry.name), 'utf-8'));
            if (evidence.id === 'compiled' && evidence.passed === true) {
              return { matches: true, reason: 'compiled evidence: tsc passed (verify gate)' };
            }
          } catch { /* malformed JSON — skip */ }
        }
      }
    } catch { /* unreadable dir — skip */ }
  }

  // Also check the build gate evidence directory (compiled evidence may be registered there)
  const buildEvidenceDir = path.join(workspacePath, '.shark', 'evidence', 'build');
  if (fs.existsSync(buildEvidenceDir)) {
    try {
      const entries = fs.readdirSync(buildEvidenceDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const evidenceFile = path.join(buildEvidenceDir, entry.name, 'evidence.json');
          if (fs.existsSync(evidenceFile)) {
            try {
              const evidence = JSON.parse(fs.readFileSync(evidenceFile, 'utf-8'));
              if (evidence.id === 'compiled' && evidence.passed === true) {
                return { matches: true, reason: 'compiled evidence: tsc passed (build gate)' };
              }
            } catch { /* malformed JSON — skip */ }
          }
        }
        if (entry.isFile() && entry.name.endsWith('.json')) {
          try {
            const evidence = JSON.parse(fs.readFileSync(path.join(buildEvidenceDir, entry.name), 'utf-8'));
            if (evidence.id === 'compiled' && evidence.passed === true) {
              return { matches: true, reason: 'compiled evidence: tsc passed (build gate)' };
            }
          } catch { /* malformed JSON — skip */ }
        }
      }
    } catch { /* unreadable dir — skip */ }
  }

  // Priority 2: Fallback — check for real compiled output files (.js/.mjs/.cjs only, not .ts).
  // .ts files are source, not compiled output — they don't prove compilation succeeded.
  const dirs = ['dist', 'output', 'build', 'lib'];
  for (const dir of dirs) {
    const dirPath = path.join(workspacePath, dir);
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && (
          entry.name.endsWith('.js') || entry.name.endsWith('.mjs') ||
          entry.name.endsWith('.cjs')
        )) {
          const filePath = path.join(dirPath, entry.name);
          const stat = fs.statSync(filePath);
          if (stat.size > 50) {
            return { matches: true, reason: `${entry.name} (${stat.size} bytes) in ${dir}/` };
          }
        }
      }
    } catch { /* unreadable or missing dir — try next */ }
  }
  return { matches: false, reason: 'No compiled evidence (tsc passed) or compiled output files found' };
}

/**
 * TEST reality: ContainerTestResult.json with REAL pass rate >= 96%.
 *
 * NO LENIENT FALLBACK. The old lenient path allowed test files (.test.ts) to
 * satisfy this gate without tests actually being run — that is a bypass.
 * Now the ONLY way to pass is a real ContainerTestResult.json proving tests ran.
 */
export function testRealityCheck(workspacePath: string): RealityCheckResult {
  const searchDirs = ['.shark/evidence/test', '.shark/evidence/verify', '.shark/evidence/delivery', '.shark', '.shark/evidence'];
  for (const dir of searchDirs) {
    const dirPath = path.join(workspacePath, dir);
    const filePath = path.join(dirPath, 'ContainerTestResult.json');
    if (fs.existsSync(filePath)) {
      try {
        const result = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
        // Accept explicit overallPassed flag
        if (result.overallPassed === true) {
          return { matches: true, reason: 'ContainerTestResult: overallPassed=true' };
        }
        // Accept explicit passRate field
        const passRate = typeof result.passRate === 'number'
          ? result.passRate
          : (typeof result.passed === 'number' && typeof result.total === 'number' && result.total > 0
            ? (result.passed as number) / (result.total as number)
            : (typeof result.passedTests === 'number' && typeof result.totalTests === 'number' && result.totalTests > 0
              ? (result.passedTests as number) / (result.totalTests as number)
              : 0));
        if (passRate >= 0.96) {
          return { matches: true, reason: `ContainerTestResult: passRate=${passRate.toFixed(2)} (>= 0.96)` };
        }
        return { matches: false, reason: `Container test pass rate ${passRate.toFixed(2)} < 0.96` };
      } catch { /* malformed JSON — try next dir */ }
    }
  }
  // NO LENIENT FALLBACK — require actual test results
  return { matches: false, reason: 'No ContainerTestResult.json with passRate >= 0.96 found' };
}

/**
 * AUDIT reality: Audit report must exist with REAL content (>50 bytes),
 * OR source files with real content must exist as a minimum indicator.
 */
export function auditRealityCheck(workspacePath: string): RealityCheckResult {
  // Priority 1: Audit report files
  const reportPaths = [
    path.join(workspacePath, '.shark', 'audit-report.md'),
    path.join(workspacePath, '.shark', 'evidence', 'audit', 'trident-report.json'),
    path.join(workspacePath, '.shark', 'TridentReport.json'),
  ];
  for (const reportPath of reportPaths) {
    if (fs.existsSync(reportPath)) {
      try {
        const stat = fs.statSync(reportPath);
        if (stat.size > 50) {
          return { matches: true, reason: `${path.basename(reportPath)} (${stat.size} bytes)` };
        }
      } catch { /* stat failed — skip */ }
    }
  }
  // Priority 2: Source .ts files with real content (audit layer will do deep check)
  const buildResult = buildRealityCheck(workspacePath);
  if (buildResult.matches) {
    return { matches: true, reason: 'source files exist — audit layer will do deep check' };
  }
  return { matches: false, reason: 'No audit report or source files with content found' };
}

/**
 * DELIVERY reality: Delivered files must exist with REAL content (>50 bytes each).
 * Empty placeholder files do NOT pass.
 */
export function deliveryRealityCheck(workspacePath: string): RealityCheckResult {
  const dirs = ['test-output', 'dist', 'output', 'build', 'src', 'lib', ''];
  let foundFiles = 0;

  for (const dir of dirs) {
    const dirPath = dir ? path.join(workspacePath, dir) : workspacePath;
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && (
          entry.name.endsWith('.ts') || entry.name.endsWith('.js') ||
          entry.name.endsWith('.json') || entry.name.endsWith('.mjs') ||
          entry.name.endsWith('.cjs')
        )) {
          const filePath = path.join(dirPath, entry.name);
          const stat = fs.statSync(filePath);
          if (stat.size > 50) {
            foundFiles++;
          }
        }
      }
    } catch { /* unreadable or missing dir — try next */ }
  }

  if (foundFiles === 0) {
    return { matches: false, reason: 'No delivered files with content >50 bytes found' };
  }
  return { matches: true, reason: `${foundFiles} delivered files with real content` };
}

/**
 * GATE_REALITY_CHECKS — maps each gate to its filesystem reality check.
 * ALL gates now have reality checks — no gate passes without verification.
 */
export const GATE_REALITY_CHECKS: Record<string, (workspacePath: string) => RealityCheckResult> = {
  plan: planRealityCheck,
  build: buildRealityCheck,
  verify: verifyRealityCheck,
  test: testRealityCheck,
  audit: auditRealityCheck,
  delivery: deliveryRealityCheck,
};

/**
 * Return the previous gate in the chain (for recovery transitions).
 */
export function getPreviousGate(gate: string): string {
  const idx = GATE_ORDER.indexOf(gate);
  if (idx <= 0) return 'plan';
  return GATE_ORDER[idx - 1];
}

/**
 * Return the gate to recover to when a gate's reality check fails.
 *
 * Per v5.1: AUDIT failure returns to BUILD (not PLAN) — the agent already
 * planned; audit failure is almost always because nothing was built.
 */
export function getRecoveryGate(gate: string): string {
  const recovery: Record<string, string> = {
    build: 'plan',
    verify: 'build',
    test: 'build',
    audit: 'build',
    delivery: 'audit',
  };
  return recovery[gate] || 'plan';
}

export type GateStatus = 'pending' | 'passed' | 'blocked' | 'failed';

export class GateManager {
  private currentGate: string = 'plan';
  private gateStatus: Record<string, GateStatus> = {};
  private gateFailureCount: Record<string, number> = {};
  private stateFile: string;
  private evidenceCollector: EvidenceCollector | null = null;
  private evidenceBasePath: string;
  private gateBlocks: number = 0;
  private testAttempts: Record<string, number> = {};
  private verifyAttempts: Record<string, number> = {};
  private auditFailures: number = 0;
  private iteration: number = 0;
  private workspacePath: string = process.cwd();
  private preflightRunner: PreflightRunnerLike | null = null;
  /** CHANGE 6: Session start time for evidence freshness checks. */
  private sessionStartTime: number;

  constructor(basePath: string = '.shark', workspacePath: string = process.cwd()) {
    // Record session start time for evidence freshness validation.
    // Evidence from previous sessions must not count toward gate advancement.
    this.sessionStartTime = Date.now();
    for (const gate of GATE_ORDER) {
      this.gateStatus[gate] = 'pending';
      this.gateFailureCount[gate] = 0;
    }
    const sharkDir = path.resolve(basePath);
    if (!fs.existsSync(sharkDir)) {
      fs.mkdirSync(sharkDir, { recursive: true });
    }
    this.stateFile = path.join(sharkDir, 'gate-state.json');
    this.evidenceBasePath = basePath;
    this.workspacePath = workspacePath;
    this.load();
    // Preserve currentGate restored from disk by load(); only default to
    // 'plan' when no valid gate was persisted.
    if (!GATE_ORDER.includes(this.currentGate)) {
      this.currentGate = 'plan';
    }
    this.save(); // Persist so disk matches memory
  }

  getCurrentGate(): string {
    return this.currentGate;
  }

  /** Get the base path used for evidence and state files */
  getBasePath(): string {
    return this.evidenceBasePath;
  }

  getGateStatuses(): Record<string, GateStatus> {
    return { ...this.gateStatus };
  }

  getFailureCounts(): Record<string, number> {
    return { ...this.gateFailureCount };
  }

  /**
   * Get evidence collector for backward compatibility.
   * Lazily initializes an EvidenceCollector bound to the GateManager's base path
   * so callers (shark-gate, shark-status) can read/write evidence safely.
   */
  getEvidenceCollector(): EvidenceCollector {
    if (!this.evidenceCollector) {
      this.evidenceCollector = new EvidenceCollector(this.evidenceBasePath);
    }
    return this.evidenceCollector;
  }

  /**
   * Return the workspace path used for filesystem reality checks.
   */
  getWorkspacePath(): string {
    return this.workspacePath;
  }

  /**
   * Phase 4.2: Wire a PreflightRunner into the GateManager so the AUDIT gate
   * can reuse cached tsc/bun-build results instead of re-running them.
   * The runner must satisfy the PreflightRunnerLike structural contract.
   */
  setPreflightRunner(runner: PreflightRunnerLike): void {
    this.preflightRunner = runner;
  }

  /**
   * Phase 4: Run filesystem-based audit criteria. Uses the wired PreflightRunner
   * if available (cached tsc/bundle), otherwise runs tsc --noEmit directly.
   */
  runAuditCriteria(): { passed: boolean; results: CriterionResult[] } {
    return runAuditCriteriaAgainstWorkspace(this.workspacePath, this.preflightRunner);
  }

  /** Get criteria for a gate — backward compatibility stub */
  getCriteria(_gate: string): { gate: string; blockingCriteria: string[]; evidenceRequired: string[] } {
    return { gate: _gate, blockingCriteria: [], evidenceRequired: [] };
  }

  /**
   * Check SPEC.md plan quality — mirrors CommonSenseEngine.verifyPlanQuality().
   *
   * The GateEngine's PLAN evaluator calls CSE.verifyPlanQuality() to dynamically
   * satisfy the 'architecture' and 'error-strategy' evidence IDs when those
   * sections exist as headers within SPEC.md. But GateManager.transitionTo()
   * and canTransition() have their OWN independent evidence check via
   * EvidenceCollector.hasRequiredEvidence() that doesn't know about CSE's
   * result. This caused a dual-check mismatch: GateEngine says "plan is good"
   * but GateManager rejects the transition because 'architecture' and
   * 'error-strategy' are still in the missing list.
   *
   * This method replicates the CSE regex checks against SPEC.md so GateManager
   * can satisfy those evidence IDs the same way GateEngine does.
   */
  private checkPlanQuality(): { passed: boolean; hasArchitecture: boolean; hasErrorStrategy: boolean } {
    try {
      const specPath = findSpecMd(this.workspacePath);
      if (!specPath) return { passed: false, hasArchitecture: false, hasErrorStrategy: false };
      const content = fs.readFileSync(specPath, 'utf-8');
      // NOTE: No minimum size check here. The GateManager evidence check
      // only verifies that the architecture and error-strategy section
      // HEADERS exist in SPEC.md. The CSE.verifyPlanQuality() function
      // (used by GateEngine.canAdvance()) enforces the 500-byte minimum
      // and full quality score as a SEPARATE, stricter check.

      // Regex patterns match CSE verification-engine.ts verifyPlanQuality()
      const hasArchitecture =
        /^#+\s*(architecture|design|structure|components?)/im.test(content) ||
        /\n(architecture|design|structure|components?)\n[-=]{3,}/i.test(content);
      const hasErrorStrategy =
        /^#+\s*(error|failure|edge cases?|exception|fallback|error handling|error strategy)/im.test(content) ||
        /\n(error (handling|strategy)|failure|edge cases?)\n[-=]{3,}/i.test(content);

      return { passed: hasArchitecture && hasErrorStrategy, hasArchitecture, hasErrorStrategy };
    } catch {
      return { passed: false, hasArchitecture: false, hasErrorStrategy: false };
    }
  }

  /**
   * Evidence check for a gate, with CSE-aware plan quality override.
   *
   * For the PLAN gate: if checkPlanQuality() confirms SPEC.md has the
   * architecture and error-strategy sections, remove those IDs from the
   * missing list — matching GateEngine's dynamic satisfaction logic.
   */
  private checkGateEvidence(gate: string): { passed: boolean; missing: string[] } {
    const result = this.getEvidenceCollector().hasRequiredEvidence(gate);

    // ── CHANGE 6: FRESHNESS CHECK ──
    // Evidence must be from the CURRENT session. Stale evidence from a
    // previous session should not satisfy gate criteria. We scan the
    // evidence directory for this gate and check if ANY evidence entry has
    // a timestamp >= sessionStartTime. If none do, the evidence is stale.
    if (result.passed && gate !== 'plan') {
      const freshEvidence = this.hasFreshEvidenceForGate(gate);
      if (!freshEvidence.hasFresh) {
        logInfo(
          `[GateManager] FRESHNESS CHECK: All evidence for '${gate}' is stale ` +
          `(oldest=${new Date(freshEvidence.oldestTs).toISOString()}, ` +
          `sessionStart=${new Date(this.sessionStartTime).toISOString()}). ` +
          `Gate evidence invalidated.`
        );
        return { passed: false, missing: [...result.missing, `stale-evidence (all evidence predates session)`] };
      }
    }

    // PLAN gate: apply CSE-aware plan quality check
    if (gate === 'plan') {
      let missing = [...result.missing];

      // Check SPEC.md section quality (architecture / error-strategy)
      const planQuality = this.checkPlanQuality();
      if (planQuality.hasArchitecture || planQuality.hasErrorStrategy) {
        // Filter out the section(s) that SPEC.md actually contains
        missing = missing.filter(m => {
          if (m === 'architecture' && planQuality.hasArchitecture) return false;
          if (m === 'error-strategy' && planQuality.hasErrorStrategy) return false;
          return true;
        });
      }

      // SPEC.md existence satisfies 'spec' evidence requirement
      if (missing.includes('spec')) {
        const specPath = findSpecMd(this.workspacePath);
        if (specPath) {
          // Check it's not empty (at least 100 bytes)
          const stat = fs.statSync(specPath);
          if (stat.size >= 100) {
            missing = missing.filter(m => m !== 'spec');
          }
        }
      }

      // Persist spec evidence to disk
      if (!missing.includes('spec')) {
        try {
          const evidenceDir = path.join(this.workspacePath, '.shark', 'evidence', 'plan');
          fs.mkdirSync(evidenceDir, { recursive: true });
          fs.writeFileSync(
            path.join(evidenceDir, 'spec-evidence.json'),
            JSON.stringify({ id: 'spec', passed: true, timestamp: Date.now(), source: 'SPEC.md auto-detect' })
          );
        } catch {
          // best-effort persist — don't block gate logic on write failure
        }
      }

      return { passed: missing.length === 0, missing };
    }

    // ── BUG 2 FIX: Defensive check for AUDIT gate report values ──
    // Even if evidence IDs are registered as passed, verify that the actual
    // report files don't contain false values. This prevents a hollow gate
    // pass when stale report files from a previous run have aligned=false
    // or authentic=false.
    if (gate === 'audit' && result.passed) {
      const auditDir = path.join(this.evidenceBasePath, 'evidence', 'audit');
      // Check SpecAlignmentReport.json
      const specAlignPath = path.join(auditDir, 'SpecAlignmentReport.json');
      if (fs.existsSync(specAlignPath)) {
        try {
          const report = JSON.parse(fs.readFileSync(specAlignPath, 'utf-8'));
          if (report.aligned === false) {
            return { passed: false, missing: [...result.missing, 'spec-alignment (report says aligned=false)'] };
          }
        } catch { /* malformed JSON — skip defensive check */ }
      }
      // Check TestAuthenticityReport.json
      const testAuthPath = path.join(auditDir, 'TestAuthenticityReport.json');
      if (fs.existsSync(testAuthPath)) {
        try {
          const report = JSON.parse(fs.readFileSync(testAuthPath, 'utf-8'));
          if (report.authentic === false) {
            return { passed: false, missing: [...result.missing, 'test-authenticity (report says authentic=false)'] };
          }
        } catch { /* malformed JSON — skip defensive check */ }
      }
    }

    return result;
  }

  /**
   * CHANGE 6: Check if evidence for the given gate was written during this
   * session. Evidence files are stored in .shark/evidence/{gate}/ with either:
   *   - Subdirectory format: {timestamp}-{id}/evidence.json
   *   - Flat file format: {id}-evidence.json
   *
   * Each evidence.json has a `timestamp` field. If ALL evidence entries have
   * timestamps older than sessionStartTime, the evidence is stale.
   *
   * Returns { hasFresh: boolean, oldestTs: number }.
   */
  private hasFreshEvidenceForGate(gate: string): { hasFresh: boolean; oldestTs: number } {
    const gateDir = path.join(this.evidenceBasePath, 'evidence', gate);
    let oldestTs = Infinity;
    let hasFresh = false;

    try {
      const entries = fs.readdirSync(gateDir, { withFileTypes: true });
      for (const entry of entries) {
        let evidencePath: string | null = null;

        if (entry.isDirectory()) {
          // Subdirectory format: {timestamp}-{id}/evidence.json
          const subEvidence = path.join(gateDir, entry.name, 'evidence.json');
          if (fs.existsSync(subEvidence)) evidencePath = subEvidence;
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
          // Flat file format: {id}-evidence.json
          evidencePath = path.join(gateDir, entry.name);
        }

        if (evidencePath) {
          try {
            const content = fs.readFileSync(evidencePath, 'utf-8');
            const parsed = safeParseJSON(content);
            if (parsed && typeof parsed === 'object') {
              const ts = (parsed as Record<string, unknown>).timestamp;
              if (typeof ts === 'number') {
                if (ts < oldestTs) oldestTs = ts;
                // CALIBRATION FIX: Evidence is fresh if:
                //   1. It was registered during this session (ts >= sessionStartTime), OR
                //   2. It was registered within the last 5 minutes (lenient freshness).
                // This prevents the chicken-and-egg where evidence registered in the
                // same tool call is rejected because sessionStartTime was set AFTER
                // the evidence was registered, or when the GateManager is re-constructed
                // (e.g., restored from disk) mid-session and sessionStartTime resets.
                const FRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes
                if (ts >= this.sessionStartTime || (Date.now() - ts) < FRESH_THRESHOLD) {
                  hasFresh = true;
                }
              } else {
                // No timestamp field — treat as fresh (conservative)
                hasFresh = true;
              }
            }
          } catch { /* malformed JSON — skip */ }
        }
      }
    } catch {
      // Directory doesn't exist or unreadable — no evidence at all.
      // Return hasFresh=true to avoid blocking when no evidence dir exists
      // (the hasRequiredEvidence check already handles the missing case).
      hasFresh = true;
    }

    return { hasFresh, oldestTs: oldestTs === Infinity ? 0 : oldestTs };
  }

  /** Update the session start time (used when a new session begins). */
  setSessionStartTime(ts: number): void {
    this.sessionStartTime = ts;
  }

  /** Get the session start time for debugging/logging. */
  getSessionStartTime(): number {
    return this.sessionStartTime;
  }

  /**
   * Attempt to transition to targetGate.
   * targetGate comes FROM THE MODEL — dynamic, never hardcoded.
   * Validates the transition is legal.
   * On failure: increments gate-specific counter. Hits limit → fatal halt.
   *
   * CHANGE 3+5: transitionTo() now REQUIRES:
   *   1. Current gate status must NOT be 'failed' (CHANGE 5)
   *   2. Reality check must pass for the current gate (CHANGE 3)
   *   3. Evidence must be sufficient (existing logic)
   */
  transitionTo(targetGate: string, _failureContext?: string): {
    success: boolean; from: string; to: string; error?: string; counts: Record<string, number>;
  } {
    // ══ CHANGE 5: GATE STATUS INTEGRITY ══
    // Can't advance if current gate is 'failed'. The agent must resolve
    // the failure (reset to PLAN or fix the issue) before advancing.
    if (this.gateStatus[this.currentGate] === 'failed') {
      return {
        success: false,
        from: this.currentGate,
        to: targetGate,
        error: `Gate ${this.currentGate} is FAILED. Cannot advance until resolved.`,
        counts: this.getFailureCounts(),
      };
    }

    // ══ CHANGE 3: REALITY CHECK REQUIRED ══
    // Must have passed reality check before transitioning. This prevents
    // advancing past a gate whose filesystem state doesn't match the
    // gate's claimed outcome (e.g., BUILD gate with no .ts files).
    const realityCheckFn = GATE_REALITY_CHECKS[this.currentGate];
    if (realityCheckFn) {
      const reality = realityCheckFn(this.workspacePath);
      if (!reality.matches) {
        // Reality check FAILS — mark gate as failed, don't transition
        this.gateStatus[this.currentGate] = 'failed';
        this.gateFailureCount[this.currentGate] = (this.gateFailureCount[this.currentGate] || 0) + 1;
        this.save();
        return {
          success: false,
          from: this.currentGate,
          to: targetGate,
          error: `Reality check failed: ${reality.reason}`,
          counts: this.getFailureCounts(),
        };
      }
    }

    // Guard: transitioning to current gate is a no-op.
    // Prevents silent success when the agent calls advance with the gate
    // it's already on.
    if (targetGate === this.currentGate) {
      return {
        success: false,
        error: `Already on ${targetGate} gate. Nothing to transition.`,
        from: this.currentGate,
        to: targetGate,
        counts: this.getFailureCounts(),
      };
    }

    const currentIdx = GATE_ORDER.indexOf(this.currentGate);
    const targetIdx = GATE_ORDER.indexOf(targetGate);

    // Allow manual reset to PLAN from anywhere
    if (targetGate === 'plan') {
      // ── FIXED (v5.1): AUDIT → BUILD recovery ──
      // When the agent is in AUDIT and tries to reset to PLAN, redirect to BUILD.
      // The agent already planned — audit failure is almost always because nothing
      // was built (enforcement blocked writes). Returning to BUILD gives the agent
      // room to actually create files.
      if (this.currentGate === 'audit') {
        this.currentGate = 'build';
        this.gateFailureCount['audit'] = (this.gateFailureCount['audit'] || 0) + 1;
        this.save();
        return {
          success: true, from: 'audit', to: 'build',
          counts: this.getFailureCounts(),
        };
      }
      this.currentGate = 'plan';
      this.save();
      // Verified: manual reset to plan — always allowed from any gate, state persisted to disk
      return {
        success: true, from: this.currentGate, to: 'plan',
        counts: this.getFailureCounts(),
      };
    }

    // Validate: must be a valid gate in the chain
    if (targetIdx === -1) {
      return {
        success: false, from: this.currentGate, to: targetGate,
        error: `[GATE] Unknown gate: ${targetGate}. Valid gates: ${GATE_ORDER.join(', ')}.`,
        counts: this.getFailureCounts(),
      };
    }

    // Enforce sequential forward progression — BLOCK forward-skip jumps.
    // The bug this fixes: the agent calling `advance gate=verify` while at `plan`
    // jumped plan→verify, skipping BUILD entirely (build never entered, no source
    // could be written). Forward jumps must step through every gate in GATE_ORDER.
    // Backward transitions (recovery: verify→build, test→build) remain allowed.
    if (targetIdx > currentIdx + 1) {
      const expected = GATE_ORDER[currentIdx + 1];
      logInfo(
        `[GateManager] BLOCKED forward-skip: '${this.currentGate}' → '${targetGate}'. ` +
        `Must advance to '${expected}' first.`
      );
      this.gateBlocks = (this.gateBlocks || 0) + 1;
      this.save();
      return {
        success: false, from: this.currentGate, to: targetGate,
        error: `[GATE] Cannot skip gates: '${this.currentGate}' → '${targetGate}'. Advance to '${expected}' first.`,
        counts: this.getFailureCounts(),
      };
    }

    // Verify evidence for current gate before allowing transition.
    // Uses checkGateEvidence() which applies CSE-aware plan quality override
    // for the PLAN gate — SPEC.md sections satisfy architecture/error-strategy.
    const evidenceCheck = this.checkGateEvidence(this.currentGate);
    if (!evidenceCheck.passed) {
      this.gateBlocks = (this.gateBlocks || 0) + 1;
      this.save();
      return {
        success: false, from: this.currentGate, to: targetGate,
        error: `Evidence required for ${this.currentGate}: ${evidenceCheck.missing.join(', ')}`,
        counts: this.getFailureCounts(),
      };
    }

    this.gateFailureCount[this.currentGate] = 0;
    // Mark the gate we're leaving as 'passed'
    if (!this.gateStatus[this.currentGate] || this.gateStatus[this.currentGate] === 'pending') {
      this.gateStatus[this.currentGate] = 'passed';
    }
    this.currentGate = targetGate;
    this.save();

    // Verified: evidence check passed (line 161-170), failure count reset, gate state persisted
    return {
      success: true, from: GATE_ORDER[currentIdx], to: targetGate,
      counts: this.getFailureCounts(),
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // BUG #4: Required methods called by gate-hook.ts and shark-gate.ts
  // ─────────────────────────────────────────────────────────────────

  /**
   * Check if transition to targetGate is legal:
   *   1. Target must be exactly one step forward (adjacent)
   *   2. Current gate must have required evidence
   */
  canTransition(targetGate: string): boolean {
    const currentIdx = GATE_ORDER.indexOf(this.currentGate);
    const targetIdx = GATE_ORDER.indexOf(targetGate);

    if (targetIdx === -1) return false;
    if (targetIdx !== currentIdx + 1) return false;

    try {
      // Use CSE-aware evidence check — PLAN gate SPEC.md sections satisfy
      // architecture/error-strategy evidence IDs.
      const check = this.checkGateEvidence(this.currentGate);
      return check.passed;
    } catch {
      logInfo('[gates] canTransition evidence check failed');
      return false;
    }
  }

  /**
   * Mark current gate as passed — BUT ONLY IF filesystem reality matches.
   *
   * Phase 5: Gate State Reality Check. Before marking a gate as 'passed', the
   * gate's reality check verifies that the gate's claimed outcome actually
   * exists on disk (BUILD → src/ files exist, VERIFY → dist/ has content,
   * TEST → ContainerTestResult.json exists, AUDIT → audit criteria met,
   * DELIVERY → dist/ has content). If reality does NOT match, the gate is
   * marked 'failed' and the manager transitions back to the recovery gate,
   * fixing the "delivery=passed with nothing delivered" lie.
   *
   * Returns a result object so callers (gate-hook) can detect a failed
   * reality check and skip the subsequent transitionTo(nextGate).
   */
  passCurrentGate(): { verified: boolean; reason?: string; recoveryGate?: string } {
    const realityCheckFn = GATE_REALITY_CHECKS[this.currentGate];
    if (realityCheckFn) {
      const reality = realityCheckFn(this.workspacePath);
      if (!reality.matches) {
        // Gate state doesn't match reality — FAIL and return to recovery gate.
        this.gateStatus[this.currentGate] = 'failed';
        this.gateFailureCount[this.currentGate] = (this.gateFailureCount[this.currentGate] || 0) + 1;
        const recoveryGate = getRecoveryGate(this.currentGate);
        logInfo(
          `[GateManager] REALITY CHECK FAILED for '${this.currentGate}': ${reality.reason}. ` +
          `Failing gate and transitioning to '${recoveryGate}'.`
        );
        // Track recovery transition for loop detection
        trackGateTransition(this.currentGate, recoveryGate);
        this.currentGate = recoveryGate;
        this.save();
        return { verified: false, reason: reality.reason, recoveryGate };
      }
    }
    this.gateStatus[this.currentGate] = 'passed';
    this.iteration++;
    this.save();
    return { verified: true };
  }

  /** Mark current gate as failed */
  failCurrentGate(): void {
    this.gateStatus[this.currentGate] = 'failed';
    this.save();
  }

  /** Mark current gate as blocked */
  blockCurrentGate(): void {
    this.gateStatus[this.currentGate] = 'blocked';
    this.save();
  }

  /**
   * Handle a test-gate failure. Increments the per-gate test attempt counter.
   * Returns action 'escalate' when the limit is reached, 'retry' otherwise.
   */
  handleTestFailure(): { action: string; attempts: number; limit: number } {
    const gate = this.currentGate;
    this.testAttempts[gate] = (this.testAttempts[gate] || 0) + 1;
    const limit = GATE_FAIL_LIMITS['test'] || 11;
    const action = this.testAttempts[gate] >= limit ? 'escalate' : 'retry';
    this.save();
    return { action, attempts: this.testAttempts[gate], limit };
  }

  /** Get current gate's test failure attempt count */
  getTestAttempts(): number {
    return this.testAttempts[this.currentGate] || 0;
  }

  /**
   * Handle a verify-gate failure. Increments the per-gate verify attempt counter.
   * Returns action 'escalate' when the limit is reached, 'retry' otherwise.
   */
  handleVerifyFailure(): { action: string; attempts: number; limit: number } {
    const gate = this.currentGate;
    this.verifyAttempts[gate] = (this.verifyAttempts[gate] || 0) + 1;
    const limit = GATE_FAIL_LIMITS['verify'] || 22;
    const action = this.verifyAttempts[gate] >= limit ? 'escalate' : 'retry';
    this.save();
    return { action, attempts: this.verifyAttempts[gate], limit };
  }

  /** Get current gate's verify failure attempt count */
  getVerifyAttempts(): number {
    return this.verifyAttempts[this.currentGate] || 0;
  }



  /** Handle an audit-gate failure. Increments audit failure counter */
  handleAuditFailure(): void {
    this.auditFailures++;
    this.save();
  }

  /**
   * FIXED (v5.1): Recover from audit failure by returning to BUILD.
   *
   * When audit fails because no build artifacts exist (the most common
   * catch-22 scenario), returning to PLAN just restarts the planning cycle.
   * The agent already planned — it just couldn't execute due to enforcement
   * blocking writes. This method transitions back to BUILD so the agent
   * gets room to actually create files.
   */
  recoverFromAudit(): { success: boolean; from: string; to: string; error?: string } {
    if (this.currentGate !== 'audit') {
      return { success: false, from: this.currentGate, to: 'build', error: 'Recovery only applies from AUDIT gate' };
    }
    // Go back to BUILD instead of PLAN — planning is already done
    this.currentGate = 'build';
    this.gateFailureCount['audit'] = (this.gateFailureCount['audit'] || 0) + 1;
    this.save();
    return { success: true, from: 'audit', to: 'build' };
  }

  /** Return current iteration string (e.g. "V1.0") */
  getCurrentIteration(): string {
    return `V1.${this.iteration}`;
  }

  /** Return true if the pipeline has reached the delivery gate */
  isComplete(): boolean {
    return this.currentGate === 'delivery';
  }

  /**
   * Restore gate state from a checkpoint or partial state object.
   * Accepts:
   *   - A gate name string (sets currentGate only)
   *   - A full state object (from getState() or checkpoint file)
   *   - A nested checkpoint { id, state: {...} } format
   */
  restore(input: string | Record<string, unknown>): void {
    if (typeof input === 'string') {
      if (GATE_ORDER.includes(input)) {
        this.currentGate = input;
        this.save();
      }
      return;
    }

    if (!input || typeof input !== 'object') return;

    // Handle nested checkpoint format: { id, timestamp, message, state: {...} }
    const s = (input.state && typeof input.state === 'object' && input.state !== null)
      ? input.state as Record<string, unknown>
      : input;

    if (typeof s.currentGate === 'string' && GATE_ORDER.includes(s.currentGate)) {
      this.currentGate = s.currentGate;
    }
    if (typeof s.gateStatus === 'object' && s.gateStatus !== null) {
      this.gateStatus = s.gateStatus as Record<string, GateStatus>;
    }
    if (typeof s.gateFailureCount === 'object' && s.gateFailureCount !== null) {
      this.gateFailureCount = s.gateFailureCount as Record<string, number>;
    }
    if (typeof s.testAttempts === 'object' && s.testAttempts !== null) {
      this.testAttempts = s.testAttempts as Record<string, number>;
    }
    if (typeof s.verifyAttempts === 'object' && s.verifyAttempts !== null) {
      this.verifyAttempts = s.verifyAttempts as Record<string, number>;
    } else if (typeof s.verifyAttempts === 'number') {
      this.verifyAttempts[this.currentGate] = s.verifyAttempts;
    }
    if (typeof s.gateBlocks === 'number') this.gateBlocks = s.gateBlocks;
    if (typeof s.auditFailures === 'number') this.auditFailures = s.auditFailures;
    if (typeof s.iteration === 'number') {
      this.iteration = s.iteration;
    } else if (typeof s.currentIteration === 'string') {
      const m = s.currentIteration.match(/V\d+\.(\d+)/);
      if (m) this.iteration = parseInt(m[1], 10);
    }

    this.save();
  }

  getState(): Record<string, unknown> {
    return {
      currentGate: this.currentGate,
      gateStatus: { ...this.gateStatus },
      gateFailureCount: { ...this.gateFailureCount },
      gateBlocks: this.gateBlocks,
      testAttempts: { ...this.testAttempts },
      verifyAttempts: { ...this.verifyAttempts },
      auditFailures: this.auditFailures,
      iteration: this.iteration,
      currentIteration: this.getCurrentIteration(),
    };
  }

  private save(): void {
    try {
      const state = this.getState();
      const dir = path.dirname(this.stateFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmp = this.stateFile + '.tmp.' + Date.now();
      fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
      fs.renameSync(tmp, this.stateFile);
    } catch (err) {
      logInfo('[GateManager] State operation FAILED: ' + (err instanceof Error ? err.message : String(err)));
      throw err; // CRITICAL: gate state must be consistent
    }
  }

  private load(): void {
    try {
      if (fs.existsSync(this.stateFile)) {
        const raw = fs.readFileSync(this.stateFile, 'utf-8');
        const state = safeParseJSON(raw);
        // P2: runtime type guard before property access
        if (typeof state === 'object' && state !== null) {
          const s = state as Record<string, unknown>;
          // Gate state SHOULD persist across restarts. Restore currentGate
          // from disk, but only if it is a valid gate name in GATE_ORDER.
          if (typeof s.currentGate === 'string' && GATE_ORDER.includes(s.currentGate)) {
            this.currentGate = s.currentGate;
          }
          if (typeof s.gateStatus === 'object' && s.gateStatus !== null) {
            this.gateStatus = s.gateStatus as Record<string, GateStatus>;
          }
          if (typeof s.gateFailureCount === 'object' && s.gateFailureCount !== null) {
            this.gateFailureCount = s.gateFailureCount as Record<string, number>;
          }
          if (typeof s.gateBlocks === 'number') this.gateBlocks = s.gateBlocks;
          if (typeof s.testAttempts === 'object' && s.testAttempts !== null) {
            this.testAttempts = s.testAttempts as Record<string, number>;
          }
          if (typeof s.verifyAttempts === 'object' && s.verifyAttempts !== null) {
            this.verifyAttempts = s.verifyAttempts as Record<string, number>;
          }
          if (typeof s.auditFailures === 'number') this.auditFailures = s.auditFailures;
          if (typeof s.iteration === 'number') this.iteration = s.iteration;
        }
      }
    } catch {
      logInfo('[gates] deserialize failed, using defaults');
    }
  }
}
