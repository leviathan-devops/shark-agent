/**
 * src/eie/context-matcher.ts — Deterministic Knowledge Graph Matcher
 *
 * The context matcher observes agent state on every tool call and
 * matches against the knowledge graph. O(N) where N = number of
 * nodes. Pure deterministic — no model inference.
 *
 * Returns applicable nodes sorted by severity (block > warn > guide),
 * deduplicated by category (keeps highest severity per category),
 * and capped at 5 results to avoid overwhelming the model.
 *
 * Part of EIE Phase 2 (EIE_DESIGN_SPEC.md §4).
 */

import type {
  KnowledgeNode,
  MatchCondition,
  AgentState,
  MatchField,
  Severity,
} from './types';
import { ALL_KNOWLEDGE_NODES } from './nodes';

// ── Severity ranking for sort ──────────────────────────────────

const SEVERITY_RANK: Record<Severity, number> = {
  'block': 3,
  'warn': 2,
  'guide': 1,
};

/** Maximum results returned to avoid overwhelming the model context. */
const MAX_RESULTS = 5;

/**
 * Match agent state against the knowledge graph.
 *
 * Returns applicable nodes sorted by severity (block first, then warn,
 * then guide). Deduplicates by category (keeps highest severity per
 * category). Maximum 5 results.
 */
export function matchKnowledge(state: AgentState): KnowledgeNode[] {
  const matched: KnowledgeNode[] = [];

  for (const node of ALL_KNOWLEDGE_NODES) {
    if (matchesAllConditions(node.conditions, state)) {
      matched.push(node);
    }
  }

  // Sort by severity (block first, then warn, then guide)
  matched.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);

  // Deduplicate by category (keep highest severity per category —
  // already sorted so first occurrence is highest severity)
  const seen = new Set<string>();
  const deduped = matched.filter(n => {
    if (seen.has(n.category)) return false;
    seen.add(n.category);
    return true;
  });

  // Return max 5
  return deduped.slice(0, MAX_RESULTS);
}

/**
 * Evaluate whether ALL conditions match the given state.
 * Nodes with no conditions always match.
 */
function matchesAllConditions(conditions: MatchCondition[], state: AgentState): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every(c => matchesCondition(c, state));
}

/**
 * Evaluate a single match condition against agent state.
 */
function matchesCondition(condition: MatchCondition, state: AgentState): boolean {
  const value = getFieldValue(state, condition.field);

  switch (condition.op) {
    case 'equals':
      return value === condition.value;

    case 'in':
      return Array.isArray(condition.value) && condition.value.includes(value);

    case 'exists':
      return value !== undefined && value !== null && value !== '';

    case 'matches': {
      const fieldValue = String(value ?? '').toLowerCase();
      const pattern = String(condition.value ?? '').toLowerCase();
      // Try regex first (for pipe-separated patterns like 'setInterval|setTimeout')
      try {
        const regex = new RegExp(pattern);
        if (regex.test(fieldValue)) return true;
      } catch { /* invalid regex — fall through to substring */ }
      // Fall back to substring match
      return fieldValue.includes(pattern);
    }

    case 'code-path':
      // For AST-based matching — checks if engine findings contain this pattern
      if (condition.field === 'codePattern') {
        return state.engineFindings.some(f =>
          f.ruleId.toLowerCase().includes(String(condition.value).toLowerCase()),
        );
      }
      return false;

    default:
      return false;
  }
}

/**
 * Extract a field value from agent state by match field identifier.
 */
function getFieldValue(state: AgentState, field: MatchField): unknown {
  switch (field) {
    case 'gate':
      return state.gate;

    case 'toolName':
      return state.toolName;

    case 'fileType':
      return state.fileType;

    case 'codePattern':
      // Check engine findings for code patterns
      return state.engineFindings.map(f => f.ruleId).join(',');

    case 'engine':
      return state.engineFindings.map(f => f.engine);

    case 'loopType':
      return state.loopType;

    case 'driftLevel':
      return state.driftLevel;

    case 'evidenceId':
      return state.evidenceRegistered;

    case 'errorPattern':
      return state.errorPattern;

    case 'gateTransition':
      return state.gateTransition;

    case 'phase':
      return state.phase;

    case 'codeConstruct':
      return state.currentFunction;

    default:
      return undefined;
  }
}

/**
 * Get nodes by category — useful for gate-specific injection.
 */
export function getNodesByCategory(category: string): KnowledgeNode[] {
  return ALL_KNOWLEDGE_NODES.filter(n => n.category === category);
}

/**
 * Get nodes applicable to a specific gate — for gate entry knowledge injection.
 * Finds nodes that have a condition matching on the 'gate' field.
 */
export function getNodesForGate(gate: string): KnowledgeNode[] {
  return ALL_KNOWLEDGE_NODES.filter(n =>
    n.conditions.some(c =>
      c.field === 'gate' &&
      (c.op === 'in' && Array.isArray(c.value) ? c.value.includes(gate) : c.value === gate),
    ),
  );
}

/**
 * Get node by ID.
 */
export function getNodeById(id: string): KnowledgeNode | undefined {
  return ALL_KNOWLEDGE_NODES.find(n => n.id === id);
}
