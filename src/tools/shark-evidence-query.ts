/**
 * shark-evidence-query — Query the SQLite evidence database.
 *
 * Provides query capability for evidence records with filtering by gate, rule,
 * recency, and Merkle chain integrity verification.
 *
 * Bible Order: 5 (execution verification)
 * Bible Principle: Phase 4 — Gate Engine + Merkle Evidence
 * Dependencies: EvidenceDB (src/evidence-engine/evidence-db.ts)
 */

import { tool } from '@opencode-ai/plugin';
import { z } from 'zod';
import { getEvidenceDB } from '../evidence-engine/evidence-db.js';

export function createSharkEvidenceQueryTool() {
  return tool({
    description: 'Query evidence database. Filter by gate, rule, or recency. Run Merkle chain integrity check.',

    args: {
      gate: z.string().optional().describe('Filter by gate phase (plan, build, test, verify, audit, delivery)'),
      rule: z.string().optional().describe('Filter by rule name (e.g. no-empty-catch, scope-violation)'),
      limit: z.number().optional().describe('Max results (default 20, max 200)'),
      verifyChain: z.boolean().optional().describe('Run Merkle chain integrity check on all evidence'),
    },

    execute: async (args) => {
      const edb = getEvidenceDB();
      if (!edb) {
        return JSON.stringify({ error: 'Evidence database not initialized. EvidenceDB must be set up first.' });
      }

      try {
        // Merkle chain verification mode
        if (args.verifyChain) {
          const chain = edb.verifyChain();
          return JSON.stringify({
            type: 'chain-verification',
            valid: chain.valid,
            totalBlocks: chain.totalBlocks,
            brokenLinks: chain.brokenLinks,
            message: chain.valid
              ? `Chain intact: ${chain.totalBlocks} blocks with 0 broken links`
              : `Chain BROKEN: ${chain.brokenLinks} broken links in ${chain.totalBlocks} blocks`,
          }, null, 2);
        }

        // Query mode
        const gate = args.gate;
        const rule = args.rule;
        const limit = Math.min(args.limit || 20, 200);

        let results;
        if (gate) {
          results = edb.queryByGate(gate, limit);
        } else if (rule) {
          results = edb.queryByRule(rule, limit);
        } else {
          results = edb.queryRecent(limit);
        }

        return JSON.stringify({
          type: 'evidence-query',
          count: results.length,
          totalRecords: edb.count(),
          gates: {
            plan: edb.countByGate('plan'),
            build: edb.countByGate('build'),
            test: edb.countByGate('test'),
            verify: edb.countByGate('verify'),
            audit: edb.countByGate('audit'),
            delivery: edb.countByGate('delivery'),
          },
          results: results.map(r => ({
            id: r.id,
            gate: r.gate,
            timestamp: r.timestamp,
            passed: r.passed,
            rule: r.rule,
            findingId: r.findingId,
            message: r.message ? r.message.substring(0, 200) : undefined,
          })),
        }, null, 2);
      } catch (err) {
        return JSON.stringify({ error: `Evidence query failed: ${err instanceof Error ? err.message : String(err)}` });
      }
    },
  });
}
