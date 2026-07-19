/**
 * S4 — Ungrounded Evidence Claim (AST + CFG Reachability).
 *
 * Question: "Does this claim string ('runtime grade', 'verified',
 * 'production ready') have an evidence-producing API on a reachable code
 * path?"
 *
 * Two-step verification:
 *   STEP 1 (candidate detection): Scan string literals for claim phrases.
 *           These are E10-style behavioral claims.
 *   STEP 2 (semantic confirmation): For each candidate claim, search the
 *           enclosing function's CFG for a reachable evidence-producing API
 *           (fs.writeFileSync, execSync, ...). If none is reachable from
 *           function entry to the claim position -> UNFOUNDED CLAIM.
 *
 * WHY CFG REACHABILITY, NOT FILE-LEVEL PRESENCE:
 *   A writeFileSync in dead code (after a return) does NOT ground a claim.
 *   The CFG confirms the write is actually reachable on a path to the claim.
 *
 * Skips test files (test descriptions are not product claims).
 */

import type {
  HonestyRule,
  SREFinding,
  CodeConstruct,
  ClaimString,
  CFGBlock,
  SideEffectCall,
} from './honesty-types.js';

/**
 * Claim phrases (regex tip-of-spear). When found in a string literal, they
 * warrant grounding verification. These are E10 behavioral categories.
 */
const CLAIM_PHRASES: Array<{
  regex: RegExp;
  category: ClaimString['category'];
}> = [
  { regex: /runtime[\s_-]?grade/i, category: 'runtime_grade' },
  { regex: /\bverified\b/i, category: 'verified' },
  { regex: /production[\s_-]?ready/i, category: 'production_ready' },
  { regex: /\bpassed\b.*\bcheck/i, category: 'passed' },
  { regex: /\bdelivered\b/i, category: 'delivered' },
  { regex: /container[\s_-]?tested/i, category: 'runtime_grade' },
];

/**
 * Evidence-producing APIs. If a claim's enclosing function reaches one of
 * these (on a path from entry to the claim), the claim is GROUNDED.
 *
 * Patterns use bare keyword forms (e.g. \bwriteFileSync\b) so they match BOTH
 * the qualified call (fs.writeFileSync) and the named-import bare call
 * (writeFileSync after `import { writeFileSync } from 'fs'`).
 */
export const EVIDENCE_API_PATTERNS = [
  /\bwriteFileSync\b/,
  /\bwriteFile\b/,
  /\bappendFileSync\b/,
  /\bfsPromises\.writeFile\b/,
  /\bwriteJson\b/,
  /\boutputJson\b/,
  /\boutputFile\b/,
  /\bexecSync\b/,
  /\bspawnSync\b/,
  /\bexec\b.*evidence/i,
  /\bwriteToFile\b/i,
  /\bsaveEvidence\b/i,
  /\bpersistEvidence\b/i,
  /\bwriteEvidence\b/i,
];

/** Test file patterns — S4 skips these (test descriptions are not product claims). */
const TEST_FILE_PATTERNS = [
  /\.test\.ts$/,
  /\.spec\.ts$/,
  /\.test\.tsx$/,
  /\.spec\.tsx$/,
];

/**
 * Determine whether a claim is grounded: an evidence-producing API must be
 * reachable from the function entry to the claim's position in the CFG
 * (Pillar 5 — evidence grounding). Falls back to a positional check when no
 * CFG is available (trivial bodies).
 */
function isClaimGrounded(fn: CodeConstruct, claim: ClaimString): boolean {
  const cfg = fn.cfg;
  if (!cfg) {
    // No CFG (trivial body) -> fall back to positional check: is there any
    // side-effect call BEFORE the claim that matches an evidence API?
    return fn.sideEffectCalls.some(
      (call: SideEffectCall) =>
        call.startPos <= claim.startPos &&
        EVIDENCE_API_PATTERNS.some((p: RegExp) => p.test(call.callee))
    );
  }

  // -- CFG-based: find the block containing the claim --
  /** @internal Used by BFS predecessor walk to trace evidence API grounding */
  const claimBlock = cfg.blocks.find(
    (b: CFGBlock) => claim.startPos >= b.startPos && claim.startPos <= b.endPos
  );
  if (!claimBlock) {
    // Claim not located in any block — fall back to positional check.
    return fn.sideEffectCalls.some(
      (call: SideEffectCall) =>
        call.startPos <= claim.startPos &&
        EVIDENCE_API_PATTERNS.some((p: RegExp) => p.test(call.callee))
    );
  }

  // -- Walk predecessors from claimBlock back to entry (BFS) --
  //   If ANY block on a predecessor chain contains an evidence API whose
  //   position precedes the claim, the claim is grounded.
  const visited = new Set<number>();
  const queue: number[] = [claimBlock.id];

  while (queue.length > 0) {
    const blockId = queue.shift()!;
    if (visited.has(blockId)) continue;
    visited.add(blockId);

    const block = cfg.blocks.find((b: CFGBlock) => b.id === blockId);
    if (!block) continue;

    for (const call of fn.sideEffectCalls) {
      if (call.startPos >= block.startPos && call.startPos <= block.endPos) {
        if (EVIDENCE_API_PATTERNS.some((p: RegExp) => p.test(call.callee))) {
          // Evidence API found on a reachable path AND it precedes the claim.
          if (call.startPos <= claim.startPos) return true;
        }
      }
    }

    for (const pred of block.predecessors) {
      if (!visited.has(pred)) queue.push(pred);
    }
  }

  return false; // no reachable evidence producer
}

/**
 * S4 rule object.
 */
export const s4UnGroundedClaim: HonestyRule = {
  id: 'S4',
  description:
    'Claim strings must have a reachable evidence-producing API on the same code path',
  category: 'ungrounded_claim',
  defaultSeverity: 'CRITICAL',

  check: (constructs, _checker, sourceFile) => {
    const findings: SREFinding[] = [];

    // -- Skip test files: test descriptions are not product claims --
    if (TEST_FILE_PATTERNS.some((p: RegExp) => p.test(sourceFile.fileName))) {
      return findings;
    }

    for (const fn of constructs) {
      if (fn.claimStrings.length === 0) continue;

      for (const claim of fn.claimStrings) {
        const grounded = isClaimGrounded(fn, claim);

        if (!grounded) {
          findings.push({
            ruleId: 'S4',
            severity: 'CRITICAL',
            message:
              `Claim phrase '${claim.text}' (category: ${claim.category}) at ` +
              `line ${claim.line} in function '${fn.name}' has no reachable ` +
              `evidence-producing API (fs.writeFileSync / execSync / ...) on ` +
              `any path from function entry to the claim. The claim is ` +
              `ungrounded — it asserts a property without producing the ` +
              `evidence that would substantiate it.`,
            file: sourceFile.fileName,
            line: claim.line,
            category: 'ungrounded_claim',
            evidenceChain: [
              {
                claim: `String literal contains claim phrase '${claim.text}'`,
                verified: true,
                snippet: claim.text,
              },
              {
                claim:
                  'Enclosing function has a reachable evidence-producing API call',
                verified: false, // <- root cause
                snippet: `Scanned ${fn.sideEffectCalls.length} side-effect call(s); none reachable and preceding the claim`,
              },
            ],
            remediation:
              `Before emitting the claim, write the evidence: ` +
              `fs.writeFileSync('.shark/evidence/<name>.json', JSON.stringify(realData)). ` +
              `Or remove the claim if no evidence is produced. A claim without ` +
              `a producer is theatrical.`,
            falsePositiveGuards: [
              'Verified claim phrase matches a known E10 behavioral category',
              'Verified claim is in a string literal (not a comment)',
              `Verified via CFG reachability: ${fn.sideEffectCalls.length} side-effect nodes scanned, none reachable from entry to claim`,
              'Verified file is not a test file',
            ],
          });
        }
      }
    }

    return findings;
  },
};

/** Exported so the construct-tree builder can reuse the claim phrase table. */
export { CLAIM_PHRASES };
