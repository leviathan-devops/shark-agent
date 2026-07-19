/**
 * src/eie/eie-block.ts — Canonical EIE Block Helper
 *
 * THE single entry point for ALL EIE blocks. Every throw site in the EIE
 * MUST use eieBlock() (or prepareBlockGuidance() + custom throw).
 * No throw site may push bullets manually.
 *
 * eieBlock() encapsulates the critical sequence:
 *   1. Generate bullets from matched knowledge nodes
 *   2. Push bullets to output.system[] BEFORE throwing
 *   3. Throw Error — ALWAYS propagates, never caught internally
 *
 * CRITICAL INVARIANT: Bullets are ALWAYS pushed BEFORE the throw.
 * The model only reads ~80 chars after a throw, so these bullets are
 * the last actionable guidance the model sees before the block.
 *
 * CRITICAL RULE 1: output.system is an ARRAY. Use .push(), NOT call.
 * CRITICAL RULE 7: The throw MUST NOT be wrapped in try-catch here.
 *   Only bullet GENERATION is wrapped — the throw always escapes.
 *
 * Spec reference: 03_GUIDANCE_SYSTEM.md §5 (eieBlock Helper)
 */

import type { AgentState, KnowledgeNode } from './types.js';
import { generateBullets } from './bullet-generator.js';

// ── eieBlock() — Canonical Block Entry Point ────────────────────

/**
 * eieBlock() — The CANONICAL entry point for ALL EIE blocks.
 *
 * What it does:
 * 1. Generates bullets from matched knowledge nodes (or state-matched nodes)
 * 2. Pushes bullets to output.system[] BEFORE throwing
 * 3. Throws Error — ALWAYS propagates, never caught internally
 *
 * CRITICAL: output.system is an ARRAY. Use output.system.push(msg).
 * NEVER call output.system as a function — it will throw TypeError.
 *
 * @param output - The hook params output object containing system array
 * @param state - Current agent state for context matching
 * @param reason - Human-readable reason for the block (becomes error message)
 * @param nodes - Optional pre-matched knowledge nodes. If not provided,
 *                matchKnowledge() is called internally by generateBullets().
 * @returns never — ALWAYS throws
 * @throws Error - Always throws `new Error("EIE: " + reason)`
 */
export function eieBlock(
  output: { system: string[] },
  state: AgentState,
  reason: string,
  nodes?: KnowledgeNode[]
): never {
  // STEP 1: Generate bullets (with fallback on failure)
  //
  // Bullet generation is wrapped in try-catch because generateBullets()
  // depends on matchKnowledge(), progressive disclosure, and template
  // substitution — any of which could have a bug. If it throws, we
  // degrade to a single fallback bullet so the model still gets guidance.
  //
  // CRITICAL: This catch does NOT swallow the block. It only catches
  // generation errors. The throw at STEP 4 is OUTSIDE this try-catch
  // and ALWAYS propagates. (Spec Rule 7)
  let bullets: string[];
  try {
    bullets = generateBullets(state, nodes);
  } catch {
    // Generation failed — degrade to fallback bullet.
    // reason is truncated to 60 chars so the full fallback stays <80 chars.
    // "EIE BLOCK: " (11) + reason (≤60) = ≤71 chars.
    bullets = [`EIE BLOCK: ${reason.slice(0, 60)}`];
  }

  // STEP 2: Ensure at least one bullet (model needs SOMETHING)
  //
  // generateBullets() can return an empty array if progressive disclosure
  // filtered out all nodes (all warn/guide nodes already injected). In that
  // case, provide a gate-aware fallback so the model isn't left blind.
  if (bullets.length === 0) {
    bullets = [`EIE BLOCK in ${state.gate.toUpperCase()} gate. Check requirements.`];
  }

  // STEP 3: Push bullets to output.system[] (BEFORE throw)
  //
  // output.system is an ARRAY — use .push(), NOT function call.
  // Bullets are pushed BEFORE the throw so they appear in the model's
  // context as system prompt overrides. (Spec Rule 5: bullets before throw)
  for (const bullet of bullets) {
    output.system.push(bullet);
  }

  // STEP 4: Throw (ALWAYS propagates — never caught here)
  //
  // The error is prefixed with "EIE: " to distinguish EIE blocks from
  // other errors (runtime TypeErrors, plugin errors, etc.). This prefix
  // is part of the canonical contract — all EIE blocks use it.
  throw new Error(`EIE: ${reason}`);
}

// ── prepareBlockGuidance() — Non-Throwing Variant ──────────────

/**
 * prepareBlockGuidance() — Non-throwing variant.
 *
 * Pushes bullets to output.system[] but does NOT throw.
 * The CALLER must throw after calling this.
 *
 * Used by:
 * - Gate Engine (which also generates a warhead before throwing)
 * - Planning Brain PSE block (which also generates a warhead before throwing)
 * - Any throw site that needs custom error logic before the throw
 *
 * CRITICAL: The caller MUST throw after calling this. If the caller
 * does not throw, the bullets are pushed but the tool is NOT blocked.
 *
 * @param output - The hook params output object containing system array
 * @param state - Current agent state
 * @param nodes - Optional pre-matched knowledge nodes. If not provided,
 *                matchKnowledge() is called internally by generateBullets().
 * @returns string[] - The bullets that were pushed (for logging/testing)
 */
export function prepareBlockGuidance(
  output: { system: string[] },
  state: AgentState,
  nodes?: KnowledgeNode[]
): string[] {
  // STEP 1: Generate bullets (with fallback on failure)
  //
  // Same generation logic as eieBlock(). Since this function does not
  // receive a `reason` parameter, the catch fallback uses the gate name.
  let bullets: string[];
  try {
    bullets = generateBullets(state, nodes);
  } catch {
    bullets = [`EIE: block in ${state.gate.toUpperCase()} gate.`];
  }

  // STEP 2: Ensure at least one bullet (model needs SOMETHING)
  if (bullets.length === 0) {
    bullets = [`EIE: block in ${state.gate.toUpperCase()} gate.`];
  }

  // STEP 3: Push bullets to output.system[]
  for (const bullet of bullets) {
    output.system.push(bullet);
  }

  // STEP 4: Return bullets (do NOT throw — caller handles throw)
  return bullets;
}
