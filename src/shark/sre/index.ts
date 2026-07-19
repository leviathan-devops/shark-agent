// SRE barrel — re-exports the SlopRemovalEngine and shared SRE types.
export {
  SlopRemovalEngine,
  createSlopRemovalEngine,
  createInMemorySlopRemovalEngine,
} from './honesty-engine/index.js';
export type {
  SRESemanticEngine,
  SREReport,
} from './honesty-engine/index.js';
// Re-exports shared SRE types for external consumers.
export * from './types.js';
