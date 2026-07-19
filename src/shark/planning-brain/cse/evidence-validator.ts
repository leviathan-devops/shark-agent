/**
 * Evidence Validator — Rule V-1: Evidence Content Validation
 * File: src/shark/planning-brain/cse/evidence-validator.ts
 *
 * V-1: An evidence file's EXISTENCE is necessary but not sufficient.
 * The engine reads and parses the file's CONTENT, verifying that it contains
 * real, current, machine-generated data — not hardcoded, stale, or theatrical content.
 *
 * Four sub-checks:
 *   V-1.1 Timestamp Window  — evidence within current session window
 *   V-1.2 Machine Generation — real tool output signatures, not echo/manual
 *   V-1.3 Pass/Fail Breakdown — actual test counts, not bare {overallPassed: true}
 *   V-1.4 Exports Present   — dist/index.js has real exports
 *
 * CRITICAL: This module NEVER relies on fs.existsSync alone.
 * It ALWAYS reads the file content and parses it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  AgentClaim,
  CandidateClaim,
  SessionWindow,
  ContentCheck,
  ContentCheckFailure,
  EvidenceVerification,
  EvidenceProvenance,
  CheckResult,
  CheckSeverity,
} from './cse-types.js';
import {
  CHECK_WEIGHTS,
  CHECK_SEVERITY,
  MIN_VALID_CONFIDENCE,
} from './cse-types.js';

/**
 * Safe JSON parse — returns { parsed, parseable } instead of throwing.
 * Never produces an empty catch block.
 */
function safeJsonParse(raw: string): { parsed: unknown; parseable: boolean } {
  try {
    return { parsed: JSON.parse(raw), parseable: true };
  } catch (err) {
    // Not JSON. May be valid plaintext evidence (logs).
    // parseable remains false — downstream checks handle this gracefully.
    if (err instanceof Error) {
      // Expected for non-JSON evidence files (logs, .js files, etc.)
    }
    return { parsed: null, parseable: false };
  }
}

/**
 * Check if a timestamp is within the session window.
 * Evidence outside the window is considered STALE.
 */
function isTimestampInWindow(ts: number, window: SessionWindow): boolean {
  const windowStart = window.start - window.stalenessTolerance;
  const windowEnd = window.latestActivity + 60_000; // 1 min future tolerance
  return ts >= windowStart && ts <= windowEnd;
}

/**
 * Detect hardcoded timestamps that indicate theatrical evidence.
 */
function isHardcodedTimestamp(tsField: string | number): boolean {
  if (tsField === 0 || tsField === '0') return true;
  if (typeof tsField === 'string') {
    if (/T00:00:00\.?0*Z?$/.test(tsField)) return true;
    if (/^2026-01-01/.test(tsField)) return true;
    if (/^1970-01-01/.test(tsField)) return true;
    if (/^2000-01-01/.test(tsField)) return true;
    if (/^1[0-9]{9}$/.test(tsField) && tsField.endsWith('000')) return true;
  }
  return false;
}

/**
 * Read file safely — returns null if file doesn't exist or can't be read.
 */
function safeReadFile(filePath: string): { content: string; size: number; mtime: number } | null {
  try {
    const stat = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    return { content, size: stat.size, mtime: stat.mtimeMs };
  } catch (err) {
    // File missing or unreadable — return null so caller can produce fileMissingResult
    if (err instanceof Error) {
      // ENOENT or permission error — file is not available for validation
    }
    return null;
  }
}

// ===========================================================================
// MAIN VALIDATION ENTRY POINT
// ===========================================================================

export class EvidenceValidator {
  private workspacePath: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  /**
   * Validate the CONTENT of an evidence file referenced by a candidate claim.
   * Does NOT rely on existence alone — reads AND parses.
   */
  validate(candidate: CandidateClaim, window: SessionWindow): EvidenceVerification {
    const filePath = this.resolvePath(candidate.claim.evidencePath ?? candidate.checkedPath);

    // STEP 1: Locate and read the file (read-before-judge)
    const fileData = safeReadFile(filePath);
    if (!fileData) {
      return this.fileMissingResult(filePath);
    }
    const { content: rawContent, size: fileSize, mtime: fileMtime } = fileData;

    // STEP 2: Parse JSON (best effort via safe helper)
    const { parsed, parseable } = safeJsonParse(rawContent);

    // STEP 3: Run content checks (V-1.1 through V-1.4)
    const checks: ContentCheck[] = [];
    checks.push(this.checkTimestampWindow(parsed, window, fileMtime));
    checks.push(this.checkMachineGeneration(rawContent, parsed, fileSize));
    checks.push(this.checkPassFailBreakdown(parsed));
    checks.push(this.checkExportsPresent(parsed, candidate.claim, rawContent));

    // STEP 4: Classify provenance
    const provenance = this.classifyProvenance(rawContent, fileMtime, window, parsed);

    // STEP 5: Collect failures
    const failures: ContentCheckFailure[] = checks
      .filter((c: ContentCheck) => c.result === 'FAIL')
      .map((c: ContentCheck) => ({
        checkId: c.checkId,
        expected: this.expectedDescription(c.checkId),
        actual: c.detail,
        severity: this.severityFor(c.checkId),
        hint: this.hintFor(c.checkId),
      }));

    // STEP 6: Aggregate confidence
    const confidence = this.aggregateConfidence(checks);

    // STEP 7: Determine overall validity
    const hasCriticalFail = failures.some((f: ContentCheckFailure) => f.severity === 'CRITICAL');
    const valid = !hasCriticalFail && confidence >= MIN_VALID_CONFIDENCE;

    return {
      filePath,
      valid,
      confidence,
      checks,
      failures,
      parsedContent: parseable ? parsed : undefined,
      fileSize,
      fileMtime,
      creationProvenance: provenance,
    };
  }

  // ===========================================================================
  // V-1.1: Timestamp Window Check
  // ===========================================================================

  /**
   * Reject evidence from a previous session. Both filesystem mtime and
   * embedded JSON timestamp must be within the session window.
   */
  private checkTimestampWindow(
    parsed: unknown,
    window: SessionWindow,
    fileMtime: number,
  ): ContentCheck {
    const checkId = 'V-1.1-timestamp-window';
    const name = 'Timestamp Window';

    const mtimeInWindow = isTimestampInWindow(fileMtime, window);

    let jsonTimestampInWindow: boolean | null = null;
    let jsonTimestamp: number | null = null;
    let rawTsField: string | number | undefined;

    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      const tsField = obj.timestamp ?? obj.generatedAt ?? obj.createdAt ?? obj.time ?? obj.evaluatedAt;
      if (typeof tsField === 'string') {
        rawTsField = tsField;
        jsonTimestamp = Date.parse(tsField);
      } else if (typeof tsField === 'number') {
        rawTsField = tsField;
        jsonTimestamp = tsField;
      }
      if (jsonTimestamp !== null && !isNaN(jsonTimestamp)) {
        if (rawTsField !== undefined && isHardcodedTimestamp(rawTsField)) {
          return {
            checkId, name, result: 'FAIL' as CheckResult,
            detail: 'Timestamp appears hardcoded: "' + rawTsField + '". ' +
                    'Hardcoded timestamps (epoch zero, midnight exact, placeholder dates) ' +
                    'indicate theatrical evidence, not machine output.',
            weight: CHECK_WEIGHTS[checkId] ?? 1.0,
          };
        }
        jsonTimestampInWindow = isTimestampInWindow(jsonTimestamp, window);
      }
    }

    // Both in window -> PASS
    if (mtimeInWindow && (jsonTimestampInWindow === null || jsonTimestampInWindow)) {
      return {
        checkId, name, result: 'PASS' as CheckResult,
        detail: 'File mtime ' + new Date(fileMtime).toISOString() + ' is within session window' +
                (jsonTimestamp ? '. JSON timestamp ' + new Date(jsonTimestamp).toISOString() + ' also in window.' : '.'),
        weight: CHECK_WEIGHTS[checkId] ?? 1.0,
      };
    }

    // Both outside window -> FAIL (STALE)
    if (!mtimeInWindow && jsonTimestampInWindow === false) {
      return {
        checkId, name, result: 'FAIL' as CheckResult,
        detail: 'Both file mtime (' + new Date(fileMtime).toISOString() + ') and JSON ' +
                'timestamp (' + (jsonTimestamp ? new Date(jsonTimestamp).toISOString() : 'N/A') + ') ' +
                'are OUTSIDE the session window. Evidence is STALE.',
        weight: CHECK_WEIGHTS[checkId] ?? 1.0,
      };
    }

    // mtime outside, no JSON timestamp -> FAIL
    if (!mtimeInWindow && jsonTimestampInWindow === null) {
      return {
        checkId, name, result: 'FAIL' as CheckResult,
        detail: 'File mtime (' + new Date(fileMtime).toISOString() + ') is outside session window ' +
                'and no parseable JSON timestamp found.',
        weight: CHECK_WEIGHTS[checkId] ?? 1.0,
      };
    }

    // Mixed signals
    return {
      checkId, name, result: 'INCONCLUSIVE' as CheckResult,
      detail: 'Mixed timestamp signals — mtime ' + (mtimeInWindow ? 'in' : 'outside') + ' window, ' +
              'JSON timestamp ' + (jsonTimestampInWindow === true ? 'in' :
                jsonTimestampInWindow === false ? 'outside' : 'absent') + ' window. Manual review recommended.',
      weight: 0.5,
    };
  }

  // ===========================================================================
  // V-1.2: Machine Generation Check
  // ===========================================================================

  /**
   * Detect evidence written by hand (echo, node -e, manual write tool)
   * rather than produced by actual tool output.
   */
  private checkMachineGeneration(
    rawContent: string,
    parsed: unknown,
    fileSize: number,
  ): ContentCheck {
    const checkId = 'V-1.2-machine-generation';
    const name = 'Machine Generation';

    let score = 0;
    const reasons: string[] = [];

    // SIGNAL 1: Presence of real tool names in output
    const toolNamePatterns = [
      /\b(shark-test-runner|manta-test-runner|shark-run-trident|trident|trident-code-audit)\b/i,
      /\b(docker exec|docker run|docker build|docker compose)\b/i,
      /\b(tsc|bun build|bun test|jest|vitest|npm test|npx)\b/i,
      /\b(tmux|capture-pane)\b/i,
      /\b(verification-engine|evidence-validator|claim-verifier)\b/i,
    ];
    const hasToolNames = toolNamePatterns.some((p: RegExp) => p.test(rawContent));
    if (hasToolNames) {
      score += 0.25;
      reasons.push('contains real tool name references');
    } else {
      reasons.push('NO real tool name references found');
    }

    // SIGNAL 2: Multiple data fields (real output has many fields)
    if (parsed && typeof parsed === 'object') {
      const fieldCount = Object.keys(parsed as object).length;
      if (fieldCount >= 6) {
        score += 0.2;
        reasons.push(fieldCount + ' data fields (rich structure)');
      } else if (fieldCount >= 3) {
        score += 0.1;
        reasons.push(fieldCount + ' data fields (moderate)');
      } else {
        reasons.push('only ' + fieldCount + ' fields (suspiciously sparse)');
      }
    }

    // SIGNAL 3: Realistic timing data (non-round durations indicate machine timing)
    const durationMatch = rawContent.match(/"duration(?:Ms)?"\s*:\s*(\d+)/i);
    if (durationMatch) {
      const dur = parseInt(durationMatch[1], 10);
      if (dur > 0 && dur % 100 !== 0) {
        score += 0.15;
        reasons.push('realistic duration (' + dur + 'ms, non-round)');
      } else if (dur === 0) {
        reasons.push('duration is 0 (theatrical)');
      } else {
        reasons.push('suspiciously round duration (' + dur + 'ms)');
      }
    }

    // SIGNAL 4: Test detail arrays
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      const testsField = obj.tests ?? obj.results ?? obj.checks ?? obj.entries;
      if (Array.isArray(testsField) && testsField.length > 0) {
        score += 0.2;
        reasons.push(testsField.length + ' individual test entries');
      } else {
        reasons.push('no individual test entries array');
      }
    }

    // SIGNAL 5: Error/failure data present
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      const hasErrorFields = 'errors' in obj || 'failures' in obj ||
                             'warnings' in obj || 'stderr' in obj;
      if (hasErrorFields) {
        score += 0.1;
        reasons.push('error/warning fields present');
      }
    }

    // SIGNAL 6: Zero-byte file (impossible from real tool)
    if (fileSize === 0) {
      return {
        checkId, name, result: 'FAIL' as CheckResult,
        detail: 'File is 0 bytes. No real tool produces empty evidence files.',
        weight: CHECK_WEIGHTS[checkId] ?? 1.0,
      };
    }

    // SIGNAL 7: Suspiciously small file (<50 bytes — theatrical)
    if (fileSize < 50) {
      reasons.push('file suspiciously small (' + fileSize + ' bytes)');
      score -= 0.1;
    }

    // DECIDE
    if (score >= 0.6) {
      return {
        checkId, name, result: 'PASS' as CheckResult,
        detail: 'Evidence appears machine-generated (' + score.toFixed(2) + '): ' + reasons.join('; '),
        weight: CHECK_WEIGHTS[checkId] ?? 1.0,
      };
    }
    if (score >= 0.3) {
      return {
        checkId, name, result: 'PASS' as CheckResult,
        detail: 'Evidence has moderate machine-generation signals (' + score.toFixed(2) + '): ' + reasons.join('; '),
        weight: 0.7,
      };
    }
    return {
      checkId, name, result: 'FAIL' as CheckResult,
      detail: 'Evidence does NOT appear machine-generated (' + score.toFixed(2) + '): ' +
              reasons.join('; ') + '. Likely hand-written or theatrical.',
      weight: CHECK_WEIGHTS[checkId] ?? 1.0,
    };
  }

  // ===========================================================================
  // V-1.3: Pass/Fail Breakdown Check
  // ===========================================================================

  /**
   * Reject evidence that claims overallPassed: true with no breakdown.
   */
  private checkPassFailBreakdown(parsed: unknown): ContentCheck {
    const checkId = 'V-1.3-pass-fail-breakdown';
    const name = 'Pass/Fail Breakdown';

    if (!parsed || typeof parsed !== 'object') {
      return {
        checkId, name, result: 'INCONCLUSIVE' as CheckResult,
        detail: 'Content is not a JSON object — cannot check pass/fail breakdown.',
        weight: 0.3,
      };
    }

    const obj = parsed as Record<string, unknown>;

    const overallPassed = obj.overallPassed ?? obj.success ?? obj.allPassed ?? obj.passed;

    const hasTotal = 'totalTests' in obj || 'total' in obj || 'testCount' in obj;
    const hasPassed = 'passed' in obj || 'passCount' in obj || 'successCount' in obj;
    const hasFailed = 'failed' in obj || 'failCount' in obj || 'failureCount' in obj;
    const granularCount = (hasTotal ? 1 : 0) + (hasPassed ? 1 : 0) + (hasFailed ? 1 : 0);

    const testsArray = obj.tests ?? obj.results ?? obj.checks ?? obj.entries;
    const hasIndividualTests = Array.isArray(testsArray) && testsArray.length > 0;

    // CASE A: Has overall flag but NO breakdown -> FAIL (theatrical)
    if (overallPassed !== undefined && granularCount === 0 && !hasIndividualTests) {
      return {
        checkId, name, result: 'FAIL' as CheckResult,
        detail: 'Evidence has overallPassed/success flag but NO granular breakdown. ' +
                'Real test output includes totalTests, passed, failed counts and/or ' +
                'individual test entries. A bare {overallPassed: true} is theatrical.',
        weight: CHECK_WEIGHTS[checkId] ?? 0.8,
      };
    }

    // CASE B: Has overall flag AND breakdown — verify consistency
    if (overallPassed !== undefined && granularCount >= 2) {
      const total = Number(obj.totalTests ?? obj.total ?? obj.testCount ?? 0);
      const passed = Number(obj.passed ?? obj.passCount ?? obj.successCount ?? 0);
      const failed = Number(obj.failed ?? obj.failCount ?? obj.failureCount ?? 0);
      const skipped = Number(obj.skipped ?? 0);

      if (total > 0 && Math.abs(total - passed - failed - skipped) > 1) {
        return {
          checkId, name, result: 'FAIL' as CheckResult,
          detail: 'Count inconsistency: total=' + total + ' but passed(' + passed + ')+failed(' + failed + ')' +
                  '+skipped(' + skipped + ')=' + (passed + failed + skipped) + '. Numbers do not add up.',
          weight: CHECK_WEIGHTS[checkId] ?? 0.8,
        };
      }

      if (overallPassed === true && failed > 0) {
        return {
          checkId, name, result: 'FAIL' as CheckResult,
          detail: 'Contradiction: overallPassed=true but failed=' + failed + '>0. ' +
                  'Cannot pass overall if tests failed.',
          weight: CHECK_WEIGHTS[checkId] ?? 0.8,
        };
      }

      if (overallPassed === false && failed === 0 && total > 0) {
        return {
          checkId, name, result: 'FAIL' as CheckResult,
          detail: 'Contradiction: overallPassed=false but failed=0. ' +
                  'If no tests failed, why is overall not passing?',
          weight: 0.8,
        };
      }

      return {
        checkId, name, result: 'PASS' as CheckResult,
        detail: 'Consistent breakdown: total=' + total + ', passed=' + passed + ', failed=' + failed + '.',
        weight: CHECK_WEIGHTS[checkId] ?? 0.8,
      };
    }

    // CASE C: Has individual test entries -> PASS
    if (hasIndividualTests) {
      const entries = testsArray as unknown[];
      const entryPassCount = entries.filter((e: unknown) =>
        e && typeof e === 'object' && (
          (e as Record<string, unknown>).status === 'pass' ||
          (e as Record<string, unknown>).passed === true ||
          (e as Record<string, unknown>).result === 'pass'
        )
      ).length;
      return {
        checkId, name, result: 'PASS' as CheckResult,
        detail: entries.length + ' individual test entries found (' + entryPassCount + ' pass). ' +
                'Real test detail present.',
        weight: CHECK_WEIGHTS[checkId] ?? 0.8,
      };
    }

    // CASE D: No pass/fail data at all
    return {
      checkId, name, result: 'INCONCLUSIVE' as CheckResult,
      detail: 'No pass/fail fields found — this may not be test evidence.',
      weight: 0.3,
    };
  }

  // ===========================================================================
  // V-1.4: Exports Present Check
  // ===========================================================================

  /**
   * When an agent claims a build produced a working module, verify that
   * dist/index.js actually contains the expected exports.
   */
  private checkExportsPresent(
    parsed: unknown,
    claim: AgentClaim,
    rawContent: string,
  ): ContentCheck {
    const checkId = 'V-1.4-exports-present';
    const name = 'Exports Present';

    const buildPath = this.resolvePath(claim.evidencePath ?? '');

    // If this is a JSON evidence file, exports check is N/A
    if (parsed !== null) {
      return {
        checkId, name, result: 'INCONCLUSIVE' as CheckResult,
        detail: 'Exports check applies to build output files, not JSON evidence.',
        weight: 0.2,
      };
    }

    if (!buildPath || !buildPath.endsWith('.js')) {
      return {
        checkId, name, result: 'INCONCLUSIVE' as CheckResult,
        detail: 'No build output path to check.',
        weight: 0.2,
      };
    }

    // Parse exports from the already-read content
    const exportPatterns = [
      /\bmodule\.exports\s*\.\s*\w+\s*=/g,
      /\bmodule\.exports\s*=\s*\{/g,
      /\bexports\.\w+\s*=/g,
      /\bexport\s+(default\s+)?(function|class|const|let|var)\s+/g,
      /\b__export\s*\(/g,
      /\bObject\.defineProperty\(exports,\s*["']/g,
    ];

    let totalExports = 0;
    for (const pattern of exportPatterns) {
      const matches = rawContent.match(pattern);
      if (matches) totalExports += matches.length;
    }

    if (totalExports === 0) {
      return {
        checkId, name, result: 'FAIL' as CheckResult,
        detail: 'Build output has 0 exports. This is an empty shell build — ' +
                'the build succeeded but produced no usable output.',
        weight: CHECK_WEIGHTS[checkId] ?? 0.6,
      };
    }

    if (totalExports < 3) {
      return {
        checkId, name, result: 'PASS' as CheckResult,
        detail: 'Build output has ' + totalExports + ' export(s) — minimal but present.',
        weight: 0.6,
      };
    }

    return {
      checkId, name, result: 'PASS' as CheckResult,
      detail: 'Build output has ' + totalExports + ' exports — substantive build.',
      weight: CHECK_WEIGHTS[checkId] ?? 0.6,
    };
  }

  // ===========================================================================
  // PROVENANCE CLASSIFICATION
  // ===========================================================================

  private classifyProvenance(
    rawContent: string,
    fileMtime: number,
    window: SessionWindow,
    parsed: unknown,
  ): EvidenceProvenance {
    if (!isTimestampInWindow(fileMtime, window)) {
      return 'STALE';
    }

    const toolNames = /\b(shark-test-runner|manta-test-runner|trident|docker|tsc|bun|jest|vitest)\b/i.test(rawContent);
    const hasStructure = rawContent.includes('"tests"') || rawContent.includes('"results"') ||
                         rawContent.includes('"errors"') || rawContent.includes('"checks"');

    if (!toolNames && !hasStructure) {
      if (rawContent.trim().startsWith('{') && rawContent.trim().endsWith('}') &&
          rawContent.length < 200) {
        return 'SUSPICIOUS';
      }
    }

    if (toolNames && hasStructure) {
      return 'MACHINE_GENERATED';
    }

    if (toolNames || hasStructure) {
      return 'LIKELY_MACHINE';
    }

    if (parsed && typeof parsed === 'object') {
      const fieldCount = Object.keys(parsed as object).length;
      if (fieldCount >= 6) return 'LIKELY_MACHINE';
    }

    return 'UNKNOWN';
  }

  // ===========================================================================
  // CONFIDENCE AGGREGATION
  // ===========================================================================

  private aggregateConfidence(checks: ContentCheck[]): number {
    const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
    if (totalWeight === 0) return 0;

    const passWeight = checks
      .filter((c: ContentCheck) => c.result === 'PASS')
      .reduce((sum, c) => sum + c.weight, 0);

    let confidence = passWeight / totalWeight;

    const criticalFails = checks.filter((c: ContentCheck) =>
      c.result === 'FAIL' && this.severityFor(c.checkId) === 'CRITICAL'
    ).length;
    confidence *= Math.pow(0.3, criticalFails);

    const inconclusiveCount = checks.filter((c: ContentCheck) => c.result === 'INCONCLUSIVE').length;
    confidence -= inconclusiveCount * 0.05;

    return Math.max(0, Math.min(1, confidence));
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  private resolvePath(p: string): string {
    if (!p) return '';
    if (path.isAbsolute(p)) return p;
    return path.resolve(this.workspacePath, p);
  }

  private fileMissingResult(filePath: string): EvidenceVerification {
    return {
      filePath,
      valid: false,
      confidence: 0,
      checks: [{
        checkId: 'file-existence',
        name: 'File Existence',
        result: 'FAIL' as CheckResult,
        detail: 'FILE MISSING — cannot validate content of non-existent file.',
        weight: 1.0,
      }],
      failures: [{
        checkId: 'file-existence',
        expected: 'File should exist at the claimed path.',
        actual: 'FILE MISSING',
        severity: 'CRITICAL' as CheckSeverity,
        hint: 'Re-run the tool that generates this evidence in the current session.',
      }],
      fileSize: 0,
      fileMtime: 0,
      creationProvenance: 'UNKNOWN' as EvidenceProvenance,
    };
  }

  private severityFor(checkId: string): CheckSeverity {
    return CHECK_SEVERITY[checkId] ?? 'MEDIUM';
  }

  private expectedDescription(checkId: string): string {
    switch (checkId) {
      case 'V-1.1-timestamp-window':
        return 'Evidence timestamp within current session window.';
      case 'V-1.2-machine-generation':
        return 'Evidence content showing real tool output signatures.';
      case 'V-1.3-pass-fail-breakdown':
        return 'Granular test counts and/or individual test entries.';
      case 'V-1.4-exports-present':
        return 'Build output file with real exports (non-empty module.exports).';
      default:
        return 'Valid content.';
    }
  }

  private hintFor(checkId: string): string {
    switch (checkId) {
      case 'V-1.1-timestamp-window':
        return 'Re-run the tool that generates this evidence in the current session. ' +
               'Stale or hardcoded timestamps invalidate the evidence.';
      case 'V-1.2-machine-generation':
        return 'Evidence must be produced by actual tool execution (e.g., shark-test-runner, ' +
               'bun build), not written by hand via echo/node -e/write tool.';
      case 'V-1.3-pass-fail-breakdown':
        return 'Include totalTests, passed, failed counts and/or individual test entries. ' +
               'A bare {overallPassed: true} is theatrical.';
      case 'V-1.4-exports-present':
        return 'Ensure the build actually exports symbols. An empty module.exports = {} ' +
               'means the build produced nothing useful.';
      default:
        return 'Review the check failure detail.';
    }
  }
}
