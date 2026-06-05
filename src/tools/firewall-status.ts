import { tool } from '@opencode-ai/plugin';
import { FirewallAudit } from '../hooks/firewall/firewall-audit.js';
import { AuditEntry } from '../hooks/firewall/types.js';

const ENABLED_LAYERS = [
  'L0 – Identity Wall',
  'L1 – Theatrical Detection',
  'L2 – Test Framework Bypass',
  'L3 – Source Inspection Theater',
  'L4 – Wrong Container',
  'L5.1 – Host Fallback',
  'L5.2 – Success Claim Without Proof',
  'L5.3 – Model Restriction',
  'L5.4 – Mock/Stub Data',
  'L5.5 – Oversimplification',
  'L5.6 – Confusion Pretense',
  'L5.7 – Scope Creep',
  'L5.8 – Undermining',
  'L5.9 – Impatience',
  'L5.10 – Self-Reference',
  'L5.11 – OpenCode Run Ban',
  'L5.12 – Privilege Escalation',
  'L5.13 – Network Egress',
  'L5.14 – Theatrical Claims',
  'L5.15 – Assumption Detection',
  'L5.16 – Fabrication Detection',
  'L5.17 – Retard Logic',
  'L5.18 – Anti-Retard',
  'L5.19 – Container Escape Prevention',
];

export function createFirewallStatusTool() {
  return tool({
    description: 'Show firewall status including enabled layers, audit entry count, and last block time',
    args: {},
    async execute(_args: Record<string, never>): Promise<string> {
      const auditLogger = new FirewallAudit(process.cwd());
      const entries: AuditEntry[] = auditLogger.getEntries();
      const entryCount = entries.length;

      let lastBlockTime = 'never';
      if (entryCount > 0) {
        const last = entries[entryCount - 1];
        lastBlockTime = last.timestamp;
      }

      return JSON.stringify({
        auditEntries: entryCount,
        lastBlockTime,
        enabledLayers: ENABLED_LAYERS,
        totalLayers: ENABLED_LAYERS.length,
        status: entryCount > 0 ? 'active' : 'clean',
      });
    },
  });
}
