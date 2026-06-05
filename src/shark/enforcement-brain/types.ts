/* Enforcement Brain — 3-Lobe Integration Types
 * Every tool call passes through:
 *   BEFORE -> Frontal Lobe (intent detection)
 *   AFTER  -> RGE (code quality) + SRE (mechanical verification)
 */

export type EnforcementLevel = 'BLOCK' | 'WARN' | 'PASS';
export type GatePhase = 'PLAN' | 'BUILD' | 'TEST' | 'VERIFY' | 'AUDIT' | 'DELIVERY';

export interface EnforcementResult {
  level: EnforcementLevel;
  lobe: 'frontal' | 'rge' | 'sre';
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
  frontalLobe: { enabled: true, enforcement: 'BLOCK' },
  rge: { enabled: true, enforcement: 'BLOCK' },
  sre: { enabled: true, enforcement: 'BLOCK' },
  basePath: '.shark',
};
