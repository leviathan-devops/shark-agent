/**
 * SRE Honesty Engine — barrel export.
 *
 * Exports the SlopRemovalEngine orchestrator, all five rules (S1-S5), and the
 * full type surface (findings, constructs, CFG, report, rule contract).
 *
 * This is Lobe 3 of the Execution Brain — peer to RGE (correctness) and SF
 * (structure). It asks a single question of every function:
 *   "Is this code honest about what it did?"
 */

// Orchestrator
export { SlopRemovalEngine } from './honesty-engine.js';

// Own compiler host (Law 8: Peer Not Puppet — separate from RGE/SF hosts)
export {
  createSlopRemovalEngine,
  createInMemorySlopRemovalEngine,
  type SRESemanticEngine,
} from './honesty-compiler-host.js';

// Rules
export {
  s1TheatricalReturn,
  matchEnforcementKeyword,
  ENFORCEMENT_KEYWORDS,
  SUCCESS_CLAIM_PROPERTIES,
} from './s1-theatrical-return.js';
export { s2FakeTest } from './s2-fake-test.js';
export { s3MockInProduction } from './s3-mock-in-production.js';
export { s4UnGroundedClaim, CLAIM_PHRASES } from './s4-ungrounded-claim.js';
export { s5EmptyHandler } from './s5-empty-handler.js';

// Types
export type {
  SREFindingId,
  HonestyCategory,
  HonestySeverity,
  HonestyEvidenceStep,
  SREFinding,
  SideEffectCategory,
  ReturnRecord,
  SideEffectCall,
  CatchClauseRecord,
  ClaimString,
  ClaimCategory,
  MockCall,
  CodeConstruct,
  CFGBlockKind,
  CFGBlock,
  FunctionCFG,
  RuleVerdict,
  GroundingReport,
  BlindSpot,
  SREReport,
  HonestyRule,
} from './honesty-types.js';
