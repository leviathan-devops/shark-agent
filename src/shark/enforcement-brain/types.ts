/* Enforcement Brain — 2-Lobe Integration Types
 * Every tool call passes through:
 *   BEFORE -> Frontal Lobe (intent detection)
 *   AFTER  -> RGE (code quality) + SRE (mechanical verification)
 */

/**
 * Enforcement severity scale — Appendix B 6-level hierarchy.
 * CRITICAL → hard block (catastrophic risk)
 * HIGH     → hard block (serious policy violation)
 * MEDIUM   → warn (requires attention, execution proceeds)
 * LOW      → warn (minor concern, execution proceeds)
 * INFO     → informational, no action needed
 * PASS     → no enforcement issue
 */
export type EnforcementLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' | 'PASS';
export type GatePhase = 'PLAN' | 'BUILD' | 'TEST' | 'VERIFY' | 'AUDIT' | 'DELIVERY';

/** Levels that block execution (formerly 'BLOCK'). */
export const BLOCK_LEVELS: readonly EnforcementLevel[] = ['CRITICAL', 'HIGH'];
/** Levels that warn but allow execution (formerly 'WARN'). */
export const WARN_LEVELS: readonly EnforcementLevel[] = ['MEDIUM', 'LOW'];

/** Returns true if the level blocks execution (CRITICAL or HIGH). */
export function isBlockingLevel(level: EnforcementLevel): boolean {
  return level === 'CRITICAL' || level === 'HIGH';
}
/** Returns true if the level warns but allows execution (MEDIUM or LOW). */
export function isWarningLevel(level: EnforcementLevel): boolean {
  return level === 'MEDIUM' || level === 'LOW';
}

export interface EnforcementResult {
  level: EnforcementLevel;
  lobe: 'frontal' | 'rge' | 'sre' | 'semantic-firewall' | 'execution-brain' | 'ice' | 'cse' | 'cme' | 'pse' | 'context' | 'common-sense';
  findingId: string;
  message: string;
  violation?: string;
  correction?: string;
  filePath?: string;
  rule?: string;
}

export interface EnforcementReport {
  passed: boolean;
  results: EnforcementResult[];
  timestamp: string;
  toolName: string;
  sessionId: string;
}

export interface LobeConfig {
  enabled: boolean;
  enforcement: EnforcementLevel;
}

export interface EnforcementBrainConfig {
  frontalLobe: LobeConfig;
  rge: LobeConfig;
  sre: LobeConfig;
  basePath: string;
}

export const DEFAULT_ENFORCEMENT_CONFIG: EnforcementBrainConfig = {
  frontalLobe: { enabled: true, enforcement: 'CRITICAL' },
  rge: { enabled: true, enforcement: 'CRITICAL' },
  sre: { enabled: true, enforcement: 'CRITICAL' },
  basePath: '.shark',
};
