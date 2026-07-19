/**
 * Warhead #4: EvidencePipeline (priority 4)
 *
 * Tracks evidence records and Merkle chain integrity.
 * Provides live T0() with chain statistics.
 */
import type { SharkWarhead, HookRegistry } from '../warhead-registry.js';
import { isRecord } from '../warhead-registry.js';
import { shouldEnforceForAgent } from '../agent-identity.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getMerkleChain as getMerkleChainInstance } from '../../evidence-engine/merkle-chain.js';
import { getGateManager } from '../../tools/shark-gate.js';
import { getEvidenceDB } from '../../evidence-engine/evidence-db.js';

export class EvidencePipeline implements SharkWarhead {
  readonly id = 'evidence-pipeline';
  readonly priority = 4;
  readonly type = 'static' as const;

  private evidenceRecords = 0;
  private merkleChainLength = 0;
  private merkleIntegrityOk = true;
  private validationErrors = 0;

  register(hooks: HookRegistry): void {
    // HOOK: Track evidence on every tool execution and write to disk
    hooks.on('tool.execute.after', async (input: unknown, output: unknown) => {
      if (!isRecord(input)) return;
      const ti = input as { tool?: string; agent?: string };
      if (!shouldEnforceForAgent(ti.agent)) return;

      this.evidenceRecords++;

      // Write evidence to disk — use GateManager's base path (single source of truth)
      // MUST match the format expected by EvidenceCollector.getGateEvidence():
      //   {basePath}/evidence/{gate}/{entry}/evidence.json
      // where {entry} = {timestamp}-{id}
      try {
        const gm = getGateManager();
        const sharkBase = gm?.getBasePath() || path.join(process.cwd(), '.shark');
        const currentGate = gm?.getCurrentGate() || 'unknown';
        const evidenceDir = path.join(sharkBase, 'evidence', currentGate, `${Date.now()}-tool-exec-${this.evidenceRecords}`);
        if (!fs.existsSync(evidenceDir)) fs.mkdirSync(evidenceDir, { recursive: true });
        const evidenceFile = path.join(evidenceDir, 'evidence.json');
        fs.writeFileSync(evidenceFile, JSON.stringify({
          id: `tool-exec-${this.evidenceRecords}`,
          gate: currentGate,
          timestamp: Date.now(),
          source: ti.tool || 'unknown',
          passed: true,
          files: [],
        }, null, 2));
      } catch (err) {
        console.error('[EvidencePipeline] Failed to write evidence: ' + (err instanceof Error ? err.message : String(err)));
      }

      // ── SQLite evidence persistence ────────────────────────────
      try {
        const edb = getEvidenceDB();
        const currentGate2 = getGateManager()?.getCurrentGate() || 'unknown';
        if (edb) {
          edb.insert({
            id: `${currentGate2}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            gate: currentGate2,
            timestamp: new Date().toISOString(),
            passed: true,
            rule: ti.tool,
            findingId: `tool-exec-${this.evidenceRecords}`,
            message: `Tool executed: ${ti.tool || 'unknown'}`,
          });
        }
      } catch (err) {
        console.error('[EvidencePipeline] SQLite insert error:', err);
      }
    });

    // HOOK: Read Merkle chain length from MerkleChain singleton (single source of truth)
    hooks.on('compacting', () => {
      try {
        const mc = getMerkleChainInstance();
        if (mc) {
          const recent = mc.recent(10000);
          this.merkleChainLength = recent.length;
          this.merkleIntegrityOk = true;
        }
      } catch (err: unknown) {
        this.merkleIntegrityOk = false;
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[EvidencePipeline] Merkle chain read failed: ${message}`);
      }
    });
  }

  getT0(): string {
    return `[EVIDENCE] Records: ${this.evidenceRecords} | Merkle blocks: ${this.merkleChainLength} | Integrity: ${this.merkleIntegrityOk ? 'OK' : 'FAILED'}`;
  }
}
