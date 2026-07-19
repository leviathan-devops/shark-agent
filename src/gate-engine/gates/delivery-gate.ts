/**
 * Delivery Gate Evaluator — checks evidence for DELIVERY gate (final gate).
 *
 * Required evidence (from GATE_CRITERIA):
 *   - ship-package: build artifact packaged for delivery
 *   - checksum: checksum generated and verified
 *   - evidence-archive: full evidence archive compiled
 *
 * VERIFICATION MATRIX GATE: ALL matrix items must be 'behavioral-pass'.
 * If any item is 'untested', 'plumbing-only', or 'failed', the delivery is BLOCKED.
 */
import * as path from 'node:path';
import * as fs from 'node:fs';
import { loadMatrix } from '../../shared/verification-matrix.js';

export interface GateResult {
  passed: boolean;
  missing: string[];
}

export function evaluateDeliveryGate(evidence: Map<string, boolean>): GateResult {
  const required = ['ship-package', 'checksum', 'evidence-archive'];
  const missing: string[] = [];
  for (const req of required) {
    if (!evidence.has(req) || !evidence.get(req)) {
      missing.push(req);
    }
  }

  // ── Verification Matrix check: ALL items must be behavioral-pass ──
  const evidenceBase = path.join(process.cwd(), '.shark');
  if (fs.existsSync(evidenceBase)) {
    const matrix = loadMatrix(evidenceBase);
    const unverified = matrix.filter(r => r.status !== 'behavioral-pass');
    if (unverified.length > 0) {
      for (const r of unverified) {
        missing.push(`matrix:${r.id}:${r.status}`);
      }
    }
  }

  return { passed: missing.length === 0, missing };
}
