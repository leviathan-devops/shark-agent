/**
 * shark-audit — AUDIT Gate Tool
 *
 * Runs the 5-check audit system:
 *   1. Spec alignment
 *   2. Test authenticity (not hand-written evidence)
 *   3. Runtime-grade functionality
 *   4. Theatrical code scan
 *   5. Anti-derailment check
 *
 * Generates SpecAlignmentReport.json and TestAuthenticityReport.json
 */

import { tool } from '@opencode-ai/plugin';
import { z } from 'zod';
import { runFullAudit, checkSpecAlignment, checkTestAuthenticity, scanForTheatricalCode } from '../shared/audit-engine.js';

export function createSharkAuditTool() {
  return tool({
    description: 'Run AUDIT gate validation — spec alignment, test authenticity, theatrical code scan, anti-derailment check. Generates SpecAlignmentReport.json and TestAuthenticityReport.json.',
    args: {
      action: z.enum(['run', 'spec-alignment', 'test-authenticity', 'theatrical-scan', 'status']).describe('Action: run full audit, check spec alignment, test authenticity, theatrical code scan, or status'),
      sourceDir: z.string().optional().describe('Source directory to scan for theatrical code (default: src/)'),
    },
    execute: async (args) => {
      const { action, sourceDir } = args;

      if (action === 'spec-alignment') {
        const report = checkSpecAlignment();
        return JSON.stringify(report, null, 2);
      }

      if (action === 'test-authenticity') {
        const report = checkTestAuthenticity();
        return JSON.stringify(report, null, 2);
      }

      if (action === 'theatrical-scan') {
        const report = scanForTheatricalCode(sourceDir || 'src');
        return JSON.stringify(report, null, 2);
      }

      if (action === 'run') {
        const result = runFullAudit(sourceDir);
        return JSON.stringify(result, null, 2);
      }

      if (action === 'status') {
        const specAlign = checkSpecAlignment();
        const testAuth = checkTestAuthenticity();
        return JSON.stringify({
          specAlignmentPassed: specAlign.aligned,
          testAuthenticityPassed: testAuth.authentic,
          auditReady: specAlign.aligned && testAuth.authentic,
        }, null, 2);
      }

      return JSON.stringify({ error: 'Unknown action. Use: run, spec-alignment, test-authenticity, theatrical-scan, status' });
    },
  });
}
