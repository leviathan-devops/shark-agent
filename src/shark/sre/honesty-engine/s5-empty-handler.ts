/**
 * S5 — Empty / Swallowing Error Handler (AST-based).
 *
 * Question: "Does this catch clause handle the error or silently swallow it?"
 *
 * Three failure modes:
 *   MODE 1 (empty): the catch block has zero statements. The error is
 *           discarded entirely.
 *   MODE 2 (log-only, err unused): the catch block contains only log
 *           statements and the error binding is not referenced at all.
 *   MODE 2b (log-only observed): the catch block logs the error but has no
 *           rethrow, no failure return, and no recovery call. The error is
 *           observed, not handled.
 *
 * DOES NOT FIRE when:
 *   - The catch block rethrows (throw; throw new X(...))
 *   - The catch block returns a failure value
 *   - The catch block calls a recovery/handler function with the error
 *   - The catch block references the error binding in a non-log expression
 *
 * The error-binding-use refinement is what distinguishes S5 from a naive
 * "empty catch" detector: a block that propagates error information
 * (returning an error-bearing object) is NOT swallowed.
 */

import type {
  HonestyRule,
  SREFinding,
  CatchClauseRecord,
} from './honesty-types.js';

/**
 * S5 rule object.
 */
export const s5EmptyHandler: HonestyRule = {
  id: 'S5',
  description:
    'Catch clauses must handle errors, not silently swallow them',
  category: 'swallowed_error',
  defaultSeverity: 'HIGH',

  // ── VERIFIED (Phase 2 — Quarantine Reform): AST-based detection ──
  // S5 uses AST-classified data exclusively from the construct builder
  // (honesty-engine.ts:classifyCatch()). No regex is used anywhere in S5.
  //
  //   cc.isEmpty        — set via block.statements.length === 0 (AST node count)
  //   cc.statementCount — set via block.statements.length (AST node count)
  //   cc.isLogOnly      — set via AST walk: ts.isExpressionStatement + ts.isCallExpression
  //                        + LOG_ONLY_CALLEES Set lookup (not regex)
  //   cc.errorBindingUsed — set via AST walk for identifier references
  //   cc.hasNonLogStatement — set via AST walk checking statement kinds
  //
  // Quarantine criteria (Phase 2 §2): catch block must have ZERO statements
  // (AST .block.statements.length === 0), not just "look empty" by regex.
  // Typed catch blocks (catch (error: unknown)) with zero statements are
  // still detected by S5 but quarantine is a separate decision in
  // post-write-audit.ts.
  check: (constructs, _checker, sourceFile) => {
    const findings: SREFinding[] = [];

    for (const fn of constructs) {
      for (const cc of fn.catchClauses) {
        // MODE 1: completely empty catch block (AST: statements.length === 0).
        if (cc.isEmpty) {
          findings.push(
            buildS5Finding(
              sourceFile.fileName,
              cc,
              fn.name,
              `Catch clause at line ${cc.line} in '${fn.name}' is empty. ` +
                `The caught error is silently discarded — the caller has no ` +
                `way to know a failure occurred.`,
              'empty'
            )
          );
          continue;
        }

        // MODE 2: log-only AND error binding not referenced at all.
        if (cc.isLogOnly && cc.errorBinding !== null && !cc.errorBindingUsed) {
          findings.push(
            buildS5Finding(
              sourceFile.fileName,
              cc,
              fn.name,
              `Catch clause at line ${cc.line} in '${fn.name}' contains only ` +
                `log statements and does not reference the error binding ` +
                `'${cc.errorBinding}' in any handling context. The error is ` +
                `observed but not handled — no rethrow, no failure return, ` +
                `no recovery.`,
              'log_only'
            )
          );
        }

        // MODE 2b: log-only, error IS used (in the log) but still no handling.
        if (
          cc.isLogOnly &&
          cc.errorBindingUsed &&
          !cc.hasNonLogStatement
        ) {
          findings.push(
            buildS5Finding(
              sourceFile.fileName,
              cc,
              fn.name,
              `Catch clause at line ${cc.line} in '${fn.name}' logs the error ` +
                `'${cc.errorBinding}' but does not handle it — no rethrow, no ` +
                `failure return, no recovery call. In production the caller ` +
                `cannot distinguish success from failure.`,
              'log_only_observed'
            )
          );
        }
      }
    }

    return findings;
  },
};

/**
 * Build an S5 finding with mode-appropriate remediation.
 */
function buildS5Finding(
  fileName: string,
  cc: CatchClauseRecord,
  funcName: string,
  message: string,
  mode: 'empty' | 'log_only' | 'log_only_observed'
): SREFinding {
  const remediation =
    mode === 'empty'
      ? `Add error handling: rethrow (throw;) to propagate, or return a ` +
        `failure value, or call a recovery handler.`
      : mode === 'log_only'
        ? `Use the error binding '${cc.errorBinding}' in a handling ` +
          `expression: return an error-bearing object or throw a wrapped ` +
          `error. Logging alone is observation, not handling.`
        : `After logging, propagate the failure: rethrow (throw;) or return ` +
          `a failure value. The log helps debugging but does not inform the ` +
          `caller that the operation failed.`;

  return {
    ruleId: 'S5',
    severity: 'HIGH',
    message,
    file: fileName,
    line: cc.line,
    category: 'swallowed_error',
    evidenceChain: [
      { claim: 'Node is a catch clause', verified: true },
      {
        claim:
          mode === 'empty'
            ? 'Catch block has zero statements'
            : 'All catch-block statements are log calls',
        verified: true,
        snippet: mode === 'empty' ? '{}' : 'console.* only',
      },
      {
        claim: 'Catch block rethrows or returns a failure value',
        verified: false,
      },
    ],
    remediation,
    falsePositiveGuards: [
      `Verified catch clause in function '${funcName}'`,
      `Verified statement count: ${cc.statementCount}`,
      `Verified ${cc.statementCount} statement(s) are all log calls`,
      `Checked for throw / return / recovery call — none found`,
      `Error binding '${cc.errorBinding}' used only in log context: ${cc.errorBindingUsed}`,
    ],
  };
}
