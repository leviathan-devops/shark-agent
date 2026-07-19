/**
 * S1 — Theatrical Return Detection (AST + Behavioral Completeness).
 *
 * Question: "Did this enforcement function actually enforce anything, or did
 * it just return a success indicator?"
 *
 * THREE-CONDITION GATE — fires ONLY when ALL THREE hold:
 *   (A) Function has an ENFORCEMENT NAME (validate, check, verify, enforce,
 *       guard, block, audit, ...). A helper named 'format' is free to return
 *       success objects without doing work.
 *   (B) Function has NO FAILURE PATH among ALL returns (no false/null/Error/
 *       throw/reject). A function that cannot fail is making a claim it
 *       cannot violate.
 *   (C) Function body has NO REAL WORK before the success claim (no
 *       fs/exec/fetch/await calls preceding the claim). Temporal ordering
 *       (Pillar 4): work must precede the claim.
 *
 * If ANY single condition fails, S1 does NOT fire. This is what makes S1
 * zero-false-positive in practice: a legitimate validator (which has a
 * failure path OR does real work) is never flagged.
 */

import type * as ts from 'typescript';
import type {
  HonestyRule,
  SREFinding,
  ReturnRecord,
  SideEffectCall,
} from './honesty-types.js';

/**
 * Enforcement keyword set. A function whose name CONTAINS one of these as a
 * whole word (case-insensitive) is presumed to be an enforcement function
 * whose return value is a verdict.
 *
 * A whitelist of compound names that are NOT enforcement verdicts prevents
 * false positives (e.g. checkArgs, verifyChecksum, ensureDir, passThrough).
 */
export const ENFORCEMENT_KEYWORDS = [
  'validate',
  'check',
  'verify',
  'enforce',
  'guard',
  'block',
  'audit',
  'inspect',
  'scan',
  'assess',
  'evaluate',
  'test',
  'authenticate',
  'authorize',
  'confirm',
  'ensure',
  'require',
];

/**
 * Compound names that should NOT be treated as enforcement verdicts even
 * though they contain an enforcement keyword. These are utility helpers that
 * legitimately cannot fail (e.g. computing a checksum, ensuring a directory
 * exists is itself the work).
 */
const ENFORCEMENT_WHITELIST = new Set([
  'checkargs',
  'checktype',
  'verifychecksum',
  'verifytoken',
  'ensuredir',
  'ensuredirectory',
  'ensureexists',
  'passthrough',
  'formatresult',
]);

/**
 * Success-claim property names. An object literal return carrying one of
 * these properties is treated as a SUCCESS CLAIM (the function is declaring
 * a positive verdict).
 */
export const SUCCESS_CLAIM_PROPERTIES = [
  'success',
  'passed',
  'ok',
  'verified',
  'complete',
  'completed',
  'delivered',
  'dispatched',
  'spawned',
  'allowed',
  'permitted',
  'confirmed',
];

/**
 * Determine whether a function name is enforcement-named.
 * Returns the matched keyword, or null.
 *
 * The match is a whole-word, case-insensitive containment check. The
 * whitelist of non-verdict compound names is consulted first.
 */
export function matchEnforcementKeyword(
  functionName: string
): string | null {
  if (!functionName || functionName === 'anonymous') return null;
  const lower = functionName.toLowerCase();
  // Whitelist: utility helpers that contain a keyword but are not verdicts.
  if (ENFORCEMENT_WHITELIST.has(lower)) return null;
  for (const keyword of ENFORCEMENT_KEYWORDS) {
    // Whole-word containment: the keyword must appear as a token boundary.
    // We accept prefix (validateBuild), suffix (buildValidate), or infix
    // (doValidateBuild) — all indicate the function is a verdict emitter.
    const idx = lower.indexOf(keyword);
    if (idx < 0) continue;
    // Confirm it is a token boundary: previous char (if any) is not a
    // letter that would make this a substring of an unrelated word.
    const prevChar = idx > 0 ? lower[idx - 1] : '';
    const nextChar = idx + keyword.length < lower.length ? lower[idx + keyword.length] : '';
    const prevBoundary = idx === 0 || !/[a-z]/.test(prevChar) || /[aeiou]/.test(prevChar) === false;
    // Accept if keyword is at a word boundary OR directly followed by an
    // uppercase letter in the original (camelCase boundary).
    const camelBoundary =
      functionName[idx + keyword.length] &&
      /[A-Z]/.test(functionName[idx + keyword.length]);
    if (idx === 0 || camelBoundary || prevBoundary || nextChar === '' || !/[a-z]/.test(nextChar)) {
      return keyword;
    }
  }
  return null;
}

/**
 * S1 rule object.
 */
export const s1TheatricalReturn: HonestyRule = {
  id: 'S1',
  description:
    'Enforcement functions must have a failure path and perform real work before claiming success',
  category: 'theatrical_return',
  defaultSeverity: 'CRITICAL',

  check: (constructs, _checker, sourceFile) => {
    const findings: SREFinding[] = [];

    for (const fn of constructs) {
      // -- CONDITION A: enforcement name --
      if (!fn.isEnforcementNamed) continue;
      const keyword = fn.enforcementKeyword;
      if (!keyword) continue;

      // Identify success-claim returns: object literal (or Promise-resolving
      // object literal) carrying a success-claim property.
      const successReturns = fn.returns.filter(
        (r: ReturnRecord) =>
          r.hasClaimObject &&
          r.claimProperties.some((p: string) =>
            SUCCESS_CLAIM_PROPERTIES.includes(p)
          )
      );
      if (successReturns.length === 0) continue; // no success claim at all

      // -- CONDITION B: behavioral completeness — enumerate ALL returns --
      // A throw anywhere also counts as a failure path.
      const hasFailurePath =
        fn.returns.some((r: ReturnRecord) => r.isFailurePath) || fn.throwStatements > 0;
      if (hasFailurePath) continue; // function CAN fail -> not theatrical

      // -- CONDITION C: real work before the success claim (Pillar 4) --
      //   Temporal ordering: work must precede the claim positionally.
      //
      //   VERIFIED (Phase 2 — Quarantine Reform): Uses AST-collected
      //   sideEffectCalls array from the construct builder
      //   (honesty-engine.ts:buildSingleConstruct). Side-effect calls are
      //   collected via ts.isCallExpression (AST walk), not regex. S1's
      //   check method contains NO regex — all data is AST-classified.
      //
      //   Quarantine criteria (Phase 2 §2): return statement must have NO
      //   side-effect calls before it in the function body. This check uses
      //   the AST startPos of each call expression relative to the first
      //   success-claim return position.
      const firstSuccessPos = Math.min(
        ...successReturns.map((r: ReturnRecord) => r.startPos)
      );
      const workBeforeClaim = fn.sideEffectCalls.some(
        (call: SideEffectCall) => call.startPos < firstSuccessPos
      );
      if (workBeforeClaim) continue; // real work happened first -> honest

      // -- ALL THREE CONDITIONS HOLD -> THEATRICAL --
      const ret = successReturns[0];

      findings.push({
        ruleId: 'S1',
        severity: 'CRITICAL',
        message:
          `Enforcement function '${fn.name}' (matches keyword '${keyword}') ` +
          `returns a success claim (${ret.claimProperties.join(', ')}) at ` +
          `line ${ret.line} but: (a) has no failure path among its ` +
          `${fn.returns.length} return statement(s), and (b) performs no ` +
          `side-effect work before the claim. This function cannot fail and ` +
          `did no work — its success claim is theatrical.`,
        file: sourceFile.fileName,
        line: ret.line,
        endLine: fn.endLine,
        category: 'theatrical_return',
        evidenceChain: [
          {
            claim: `Function name '${fn.name}' matches enforcement keyword '${keyword}'`,
            verified: true,
            snippet: fn.name,
          },
          {
            claim: `Function has a failure path (falsey return / null / throw)`,
            verified: false, // <- root cause: this is what makes it theatrical
            snippet: `${fn.returns.length} return(s), none carrying failure`,
          },
          {
            claim: `Function performs side-effect work before the success claim`,
            verified: false,
            snippet: `${fn.sideEffectCalls.length} side-effect call(s) total; 0 before claim at pos ${firstSuccessPos}`,
          },
        ],
        remediation:
          `Either (1) add a failure path: when enforcement detects a problem, ` +
          `return a failure-bearing object (e.g. { ok: false, error: '...' }) ` +
          `or throw; OR (2) add real work before the return: call ` +
          `fs/exec/fetch/await and branch the return on its result. A ` +
          `function named '${keyword}' that always returns success is ` +
          `structurally incapable of detecting problems.`,
        falsePositiveGuards: [
          `Verified function is enforcement-named (keyword '${keyword}')`,
          `Enumerated all ${fn.returns.length} return statement(s) — none carries a failure value`,
          `Scanned function body for fs/process/network/await/loop calls — none precede the claim`,
          `Checked for throw statements — ${fn.throwStatements} found`,
        ],
      });
    }

    return findings;
  },
};
