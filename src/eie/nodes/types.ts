/**
 * src/eie/nodes/types.ts — Node-Construction Helper Types
 *
 * Convenience re-exports and helper types for building knowledge nodes.
 * The canonical node type (KnowledgeNode) lives in ../types.ts; this
 * module provides builder-friendly aliases and helper interfaces used by
 * the node array modules (principles, iron-laws, gate-requirements, …).
 *
 * Importing from '../types' here lets node modules do a single local
 * import: `import type { KnowledgeNode, NodeBuilder } from './types'`.
 */

export type {
  KnowledgeNode,
  KnowledgeCategory,
  KnowledgeSource,
  AnalysisOrder,
  AuditLayer,
  Severity,
  MatchCondition,
  MatchField,
  MatchOp,
  EvidenceSpec,
  EvidenceVerifyMethod,
} from '../types';

/**
 * A builder function signature for compactly constructing nodes.
 * Node modules like gate-knowledge.ts use local helper functions that
 * accept positional arguments and return a fully-formed KnowledgeNode.
 * This type codifies that pattern.
 */
export type NodeBuilder = (...args: never[]) => import('../types').KnowledgeNode;

/** The set of gate names used in match conditions and gate knowledge. */
export type GateName =
  | 'PLAN'
  | 'BUILD'
  | 'VERIFY'
  | 'TEST'
  | 'AUDIT'
  | 'DELIVERY';

/** Numeric audit-layer literal (0-5) alias for readability in builders. */
export type LayerLiteral = 0 | 1 | 2 | 3 | 4 | 5;

/** Verify-method literal alias for evidence specs in builders. */
export type VerifyLiteral =
  | 'exec-tsc'
  | 'exec-build'
  | 'rge-audit'
  | 'sre-audit'
  | 'fs-check'
  | 'spec-read'
  | 'test-run'
  | 'gate-chain'
  | 'diff-check'
  | 'container-tui-test'
  | 'claim-reality';

/** Severity literal alias. */
export type SeverityLiteral = 'block' | 'warn' | 'guide';

/**
 * Common positional arguments accepted by node builder helpers across
 * the node modules. Builders may accept a subset; this is the superset
 * for documentation and cross-module consistency.
 */
export interface NodeBuilderArgs {
  id: string;
  rule: string;
  detectionMethod: string;
  fixTemplate: string;
  bulletTemplate: string;
  warheadTemplate: string;
  severity: SeverityLiteral;
  layer: LayerLiteral;
  links: string[];
  source: KnowledgeSource;
  sourceFile: string;
  category: KnowledgeCategory;
}

// Re-import the type-only aliases so they are usable as values/contexts
// within this file without duplicating definitions.
import type {
  KnowledgeSource,
  KnowledgeCategory,
} from '../types';
