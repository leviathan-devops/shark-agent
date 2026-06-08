import * as fs from 'node:fs';
import * as path from 'node:path';
import { SemanticFirewall } from '../../semantic-firewall/semantic-firewall.js';
import type { RuleConfig, AnalysisPhase } from '../../semantic-firewall/types.js';

const POST_WRITE_RULES: RuleConfig[] = [
  { name: 'no-empty-catch', severity: 'HIGH', enabled: true, orders: 2 },
  { name: 'no-unsafe-cast', severity: 'HIGH', enabled: true, orders: 3 },
  { name: 'no-floating-promises', severity: 'MEDIUM', enabled: true, orders: 4 },
  { name: 'evidence-bearing-results', severity: 'HIGH', enabled: true, orders: 2 },
  { name: 'no-hardcoded-paths', severity: 'MEDIUM', enabled: true, orders: 2 },
  { name: 'cleanup-paired-intervals', severity: 'HIGH', enabled: true, orders: 2 },
  { name: 'handle-zero-length', severity: 'LOW', enabled: true, orders: 2 },
  { name: 'theatrical-return', severity: 'CRITICAL', enabled: true, orders: 4 },
  { name: 'dead-export', severity: 'MEDIUM', enabled: true, orders: 3 },
  { name: 'scope-violation', severity: 'HIGH', enabled: true, orders: 5 },
];

export function createPostWriteAudit(firewall: SemanticFirewall, quarantineDir: string) {
  return async (input: Record<string, unknown>, output: Record<string, unknown>) => {
    const toolName = input?.tool || '';
    if (!['write', 'edit'].includes(toolName)) return;
    const args = (input as Record<string, unknown>)?.args || (output as Record<string, unknown>)?.args || {};
    const filePath = typeof args.filePath === 'string' ? args.filePath : '';
    const result = firewall.analyze('post-write' as AnalysisPhase, POST_WRITE_RULES);
    const critical = result.diagnostics.filter(d => d.severity === 'CRITICAL');
    for (const diag of critical) {
      if (filePath) {
        try {
          const qPath = path.join(quarantineDir, 'quarantine', Date.now() + '-' + path.basename(filePath));
          fs.mkdirSync(path.dirname(qPath), { recursive: true });
          if (fs.existsSync(filePath)) {
            fs.copyFileSync(filePath, qPath);
            fs.writeFileSync(filePath, '// QUARANTINED: ' + diag.message + '\n// Original at: ' + qPath + '\n');
          }
        } catch (qErr) { console.warn('[PostWriteAudit] quarantine failed:', qErr); }
      }
    }
    if (result.diagnostics.length > 0) {
      try {
        const logPath = path.join(quarantineDir, 'evidence', 'enforcement', 'sf-audit-' + Date.now() + '.json');
        fs.mkdirSync(path.dirname(logPath), { recursive: true });
        fs.writeFileSync(logPath, JSON.stringify({ timestamp: new Date().toISOString(), toolName, filePath, phase: 'post-write', total: result.diagnostics.length, critical: critical.length, diagnostics: result.diagnostics }, null, 2));
      } catch (logErr) { console.warn('[PostWriteAudit] log failed:', logErr); }
    }
    const warnings = result.diagnostics.filter(d => d.severity === 'MEDIUM');
    if (warnings.length > 0 && output) {
      for (const w of warnings) {
        if (!output.system) output.system = [];
        output.system.push('[SEMANTIC-FIREWALL] ' + w.severity + ': ' + w.message);
      }
    }
  };
}
