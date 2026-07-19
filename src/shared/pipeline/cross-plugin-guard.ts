/**
 * Cross-Plugin Guard — ensures the semantic pipeline runs ONLY for SHARK agents.
 * Non-SHARK agents (plan, build, general, manta, trident) get a fast path
 * that skips the entire pipeline.
 */

import { isSharkAgent } from '../agent-identity.js';

export function shouldRunSemanticPipeline(agentName: string | undefined): boolean {
  if (!agentName) return false;
  return isSharkAgent(agentName);
}
