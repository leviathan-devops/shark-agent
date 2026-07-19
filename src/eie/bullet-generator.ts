/**
 * src/eie/bullet-generator.ts — Bullet Guidance System (T0)
 *
 * Generates contextually precise <80 char bullets from knowledge nodes
 * and pushes them to output.message BEFORE a throw. The model only reads
 * ~80 chars after a throw, so these bullets are the critical guidance
 * channel.
 *
 * Key rules:
 * - Bullets MUST be <80 chars (hard limit, truncate with slice)
 * - Bullets are pushed via output.message BEFORE the throw happens
 * - Template substitution: {line}, {fn}, {file}, {gate}, {tool} replaced
 * - Maximum 3 bullets per throw (don't overwhelm)
 * - Block severity always shown; warn/guide only if progressive disclosure allows
 *
 * Part of EIE Phase 3 (EIE_DESIGN_SPEC.md §5).
 */

import type { KnowledgeNode, AgentState } from './types';
import { matchKnowledge } from './context-matcher';
import { getProgressiveDisclosure } from './progressive-disclosure';

const MAX_BULLET_LENGTH = 80;
const MAX_BULLETS = 3;

/**
 * Generate bullets for a specific violation or block event.
 * Returns array of <80 char strings ready for output.message.
 */
export function generateBullets(
  state: AgentState,
  violationNodes?: KnowledgeNode[]
): string[] {
  // Get matching knowledge nodes
  let nodes: KnowledgeNode[];
  if (violationNodes && violationNodes.length > 0) {
    nodes = violationNodes;
  } else {
    nodes = matchKnowledge(state);
  }

  // Apply progressive disclosure (block always shows, warn/guide only if new)
  const disclosure = getProgressiveDisclosure();
  nodes = disclosure.filterNew(nodes);

  // Generate bullets from nodes
  const bullets: string[] = [];
  for (const node of nodes.slice(0, MAX_BULLETS)) {
    const bullet = substituteTemplate(node.bulletTemplate, state);
    bullets.push(bullet.slice(0, MAX_BULLET_LENGTH));

    // Mark as injected
    disclosure.markInjected(node.id, state.gate);
  }

  return bullets;
}

/**
 * Push bullets to output before a throw.
 * This is the CRITICAL function — bullets MUST be pushed BEFORE the throw.
 */
export function pushBulletsBeforeThrow(
  output: { message: (msg: { role: string; content: string }) => void },
  bullets: string[]
): void {
  for (const bullet of bullets) {
    output.message({
      role: 'system',
      content: bullet
    });
  }
}

/**
 * Convenience: generate + push + return bullets for logging.
 */
export function prepareBlockGuidance(
  output: { message: (msg: { role: string; content: string }) => void },
  state: AgentState,
  violationNodes?: KnowledgeNode[]
): string[] {
  const bullets = generateBullets(state, violationNodes);
  pushBulletsBeforeThrow(output, bullets);
  return bullets;
}

/**
 * Substitute template variables in bullet string.
 * {line} → current line number
 * {fn} → current function name
 * {file} → current file name (basename)
 * {gate} → current gate
 * {tool} → current tool name
 * {name} → generic name placeholder
 */
function substituteTemplate(template: string, state: AgentState): string {
  return template
    .replace(/\{line\}/g, String(state.currentLine ?? 0))
    .replace(/\{fn\}/g, state.currentFunction ?? 'unknown')
    .replace(/\{file\}/g, state.filePath ? state.filePath.split('/').pop() ?? 'file' : 'file')
    .replace(/\{gate\}/g, state.gate.toUpperCase())
    .replace(/\{tool\}/g, state.toolName)
    .replace(/\{name\}/g, 'item');
}
