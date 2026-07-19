/**
 * Rule Ownership Matrix — Iron Law 7: Rule ownership is EXCLUSIVE.
 * Every rule has exactly ONE owning engine. No duplicates.
 * This matrix is the single source of truth.
 */
export const RULE_OWNERSHIP: Record<string, {
  owner: string;
  ruleId: string;
  description: string;
}> = {
  // ── SF OWNS: Structural rules (has TypeChecker + CFG) ──
  'SF:no-empty-catch':           { owner: 'SF',  ruleId: 'no-empty-catch',           description: 'Empty catch blocks' },
  'SF:no-unsafe-cast':           { owner: 'SF',  ruleId: 'no-unsafe-cast',           description: 'Unguarded as casts' },
  'SF:no-floating-promises':     { owner: 'SF',  ruleId: 'no-floating-promises',     description: 'Unhandled promises' },
  'SF:no-hardcoded-paths':       { owner: 'SF',  ruleId: 'no-hardcoded-paths',       description: 'Hardcoded filesystem paths' },
  'SF:cleanup-paired-intervals': { owner: 'SF',  ruleId: 'cleanup-paired-intervals', description: 'Unpaired setInterval/setTimeout' },
  'SF:scope-violation':          { owner: 'SF',  ruleId: 'scope-violation',          description: 'Writes outside workspace' },
  'SF:dead-export':              { owner: 'SF',  ruleId: 'dead-export',              description: 'Exported symbols never imported' },
  'SF:handle-zero-length':       { owner: 'SF',  ruleId: 'handle-zero-length',       description: 'No empty state guard' },

  // ── SRE OWNS: Honesty rules (behavioral completeness) ──
  'SRE:S1': { owner: 'SRE', ruleId: 'S1', description: 'Theatrical return — enforcement function that never fails' },
  'SRE:S2': { owner: 'SRE', ruleId: 'S2', description: 'Fake test — expect() with hardcoded literal' },
  'SRE:S3': { owner: 'SRE', ruleId: 'S3', description: 'Mock/stub in production code' },
  'SRE:S4': { owner: 'SRE', ruleId: 'S4', description: 'Ungrounded evidence claim' },
  'SRE:S5': { owner: 'SRE', ruleId: 'S5', description: 'Empty or swallowing error handler' },

  // ── RGE OWNS: Correctness rules (type safety + contracts) ──
  'RGE:P1':  { owner: 'RGE', ruleId: 'P1',  description: 'Defensive import — verify before use' },
  'RGE:P2':  { owner: 'RGE', ruleId: 'P2',  description: 'Type certainty — validate at boundaries' },
  'RGE:P6':  { owner: 'RGE', ruleId: 'P6',  description: 'Dependency verification' },
  'RGE:P10': { owner: 'RGE', ruleId: 'P10', description: 'Output contract — return matches declaration' },
  'RGE:R13': { owner: 'RGE', ruleId: 'R13', description: 'Data flow taint tracking' },
  'RGE:R14': { owner: 'RGE', ruleId: 'R14', description: 'CFG dead code detection' },
  'RGE:ARCH-LAYER': { owner: 'RGE', ruleId: 'ARCH-LAYER', description: 'Architecture layer enforcement' },

  // ── ICE OWNS: Intent rules ──
  'ICE:I-1': { owner: 'ICE', ruleId: 'I-1', description: 'Keyword mismatch / inappropriate import' },
  'ICE:I-2': { owner: 'ICE', ruleId: 'I-2', description: 'Gate compliance violations' },
  'ICE:I-3': { owner: 'ICE', ruleId: 'I-3', description: 'Frame match quality' },
  'ICE:I-4': { owner: 'ICE', ruleId: 'I-4', description: 'Confidence scoring' },
  'ICE:I-5': { owner: 'ICE', ruleId: 'I-5', description: 'Blind spot reporting' },

  // ── CSE OWNS: Verification rules ──
  'CSE:V-1': { owner: 'CSE', ruleId: 'V-1', description: 'Evidence content validation' },
  'CSE:V-2': { owner: 'CSE', ruleId: 'V-2', description: 'Claim-reality verification' },
  'CSE:V-3': { owner: 'CSE', ruleId: 'V-3', description: 'Behavioral pattern memory' },
  'CSE:V-4': { owner: 'CSE', ruleId: 'V-4', description: 'Evidence grounding preflight' },
  'CSE:V-5': { owner: 'CSE', ruleId: 'V-5', description: 'Transparent blind spots' },

  // ── CME OWNS: Trajectory rules ──
  'CME:T-1': { owner: 'CME', ruleId: 'T-1', description: 'Workflow alignment scoring' },
  'CME:T-2': { owner: 'CME', ruleId: 'T-2', description: 'Context relevance prediction' },
  'CME:T-3': { owner: 'CME', ruleId: 'T-3', description: 'Stagnation detection' },
  'CME:T-4': { owner: 'CME', ruleId: 'T-4', description: 'Drift detection' },
  'CME:T-5': { owner: 'CME', ruleId: 'T-5', description: 'Read-before-write freshness' },

  // ── PSE OWNS: Loop detection rules ──
  'PSE:B-1': { owner: 'PSE', ruleId: 'B-1', description: 'Loop type classification (6 types)' },
  'PSE:B-2': { owner: 'PSE', ruleId: 'B-2', description: 'Intervention selection' },
  'PSE:B-3': { owner: 'PSE', ruleId: 'B-3', description: 'Session pattern memory' },
  'PSE:B-4': { owner: 'PSE', ruleId: 'B-4', description: 'PSM activation criteria' },
  'PSE:B-5': { owner: 'PSE', ruleId: 'B-5', description: 'Progress measurement' },
};

// T1 candidate → owning engine mapping
export const T1_TO_OWNER: Record<string, string> = {
  'P1':  'RGE:P1',
  'P2':  'SF:no-unsafe-cast',
  'P3':  'SF:no-empty-catch',
  'P4':  'SF:cleanup-paired-intervals',
  'P5':  'RGE:P1',     // atomic state → closest to defensive import
  'P6':  'RGE:P6',
  'P7':  'SF:no-hardcoded-paths',
  'P8':  'RGE:P6',     // config validation → closest to dependency verification
  'P9':  'SF:no-floating-promises',
  'P10': 'RGE:P10',
  'P11': 'SRE:S1',     // side-effect truth → theatrical return
  'P12': 'SF:handle-zero-length',
};

export function getRuleOwner(ruleId: string): string | undefined {
  // Check direct ownership
  if (RULE_OWNERSHIP[ruleId]) return RULE_OWNERSHIP[ruleId].owner;
  // Check T1 mapping
  if (T1_TO_OWNER[ruleId]) return T1_TO_OWNER[ruleId].split(':')[0];
  return undefined;
}

export function getAllOwnedRules(): string[] {
  return Object.keys(RULE_OWNERSHIP);
}
