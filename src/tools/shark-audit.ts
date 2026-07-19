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
import { runAudit as eieRunAudit } from '../eie/audit-engine.js';

export function createSharkAuditTool() {
  return tool({
    description: 'Run AUDIT gate validation — spec alignment, test authenticity, theatrical code scan, anti-derailment check. Generates SpecAlignmentReport.json and TestAuthenticityReport.json.',
    args: {
      action: z.enum(['run', 'spec-alignment', 'test-authenticity', 'theatrical-scan', 'status']).describe('Action: run full audit, check spec alignment, test authenticity, theatrical code scan, or status'),
      sourceDir: z.string().optional().describe('Source directory to scan for theatrical code (default: src/)'),
      target: z.string().optional().describe('Alias for sourceDir — file or directory target for theatrical scan'),
    },
    execute: async (args) => {
      const { action, sourceDir, target } = args;
      // 'target' is an alias for 'sourceDir' — prefer target if provided
      const scanTarget = target || sourceDir || 'src';

      if (action === 'spec-alignment') {
        const report = checkSpecAlignment();
        return JSON.stringify(report, null, 2);
      }

      if (action === 'test-authenticity') {
        const report = checkTestAuthenticity();
        return JSON.stringify(report, null, 2);
      }

      if (action === 'theatrical-scan') {
        const report = scanForTheatricalCode(scanTarget);
        return JSON.stringify(report, null, 2);
      }

      if (action === 'run') {
        const result = runFullAudit(scanTarget);

        // ── Wire EIE 22-layer audit engine (R0-R22) ──
        // The shared audit-engine provides 5 checks. The EIE audit-engine
        // provides 22 layers of static analysis. Merge findings from both.
        try {
          const eieResult = eieRunAudit(process.cwd());
          if (eieResult && eieResult.findings && eieResult.findings.length > 0) {
            // Merge EIE findings into the report
            const merged = typeof result === 'object' && result !== null ? result as Record<string, unknown> : {} as Record<string, unknown>;
            const existingFindings = Array.isArray(merged.findings) ? merged.findings : [];
            merged.eieAudit = {
              verdict: eieResult.verdict,
              totalScore: eieResult.totalScore,
              layerCount: eieResult.layerCount,
              criticalCount: eieResult.criticalCount,
              highCount: eieResult.highCount,
              findings: eieResult.findings,
            };
            merged.findings = [...(existingFindings as unknown[]), ...eieResult.findings];
            merged.combinedVerdict = (eieResult.verdict === 'FAIL') ? 'FAIL' : (merged.verdict || 'PASS');
            return JSON.stringify(merged, null, 2);
          }
        } catch {
          // EIE audit failure is non-fatal — return shared audit result
        }

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
