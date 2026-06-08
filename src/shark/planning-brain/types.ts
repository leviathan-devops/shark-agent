/**
 * Planning Brain Types — Shared type definitions for all 3 lobes
 */

import type { VerificationMatrix, BehavioralRequirement } from '../../shared/verification-matrix.js';

export interface PlanningBrainState {
  currentLobe: 'idle' | 'common-sense' | 'context-mgmt' | 'frontal-psm';
  loopCount: number;
  verificationMatrix: VerificationMatrix;
  lastDriftCheck: number;
  lastContextUpdate: number;
  psmActive: boolean;
}

export interface PrecisionBullet {
  target: 'before-exec' | 'after-exec' | 'system-prompt' | 'drift-warning';
  lobe: 'common-sense' | 'context-mgmt' | 'frontal';
  content: string;
  ttl: number;
}

export interface DriftReport {
  detected: boolean;
  expected: string;
  actual: string;
  context: string;
  severity: 'info' | 'warn' | 'drift';
}
