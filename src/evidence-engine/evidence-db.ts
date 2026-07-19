/**
 * EvidenceDB — SQLite-backed evidence persistence.
 *
 * Replaces the dead JsonKVStore (329 lines of dead code) with real
 * SQLite-backed evidence storage using bun:sqlite. Bun's runtime includes
 * SQLite natively — no external dependencies needed.
 *
 * Bible Order: 5 (execution verification)
 * Bible Principle: Phase 4 — Gate Engine + Merkle Evidence
 * Wired from: evidence-pipeline.ts tool.execute.after handler
 */

import { Database } from 'bun:sqlite';
import * as path from 'node:path';
import * as fs from 'node:fs';

export interface EvidenceRecord {
  id: string;
  gate: string;
  timestamp: string;
  passed: boolean;
  rule?: string;
  findingId?: string;
  message?: string;
  chainHash?: string;
  previousHash?: string;
}

export class EvidenceDB {
  private db: Database;
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
    const dbPath = path.join(basePath, 'evidence.db');
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this.db = new Database(dbPath);

    // Enable WAL mode for concurrent access
    this.db.run('PRAGMA journal_mode=WAL');

    this.db.run(`
      CREATE TABLE IF NOT EXISTS evidence (
        id TEXT PRIMARY KEY,
        gate TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        passed INTEGER NOT NULL DEFAULT 0,
        rule TEXT,
        findingId TEXT,
        message TEXT,
        chainHash TEXT UNIQUE,
        previousHash TEXT
      )
    `);

    this.db.run('CREATE INDEX IF NOT EXISTS idx_evidence_gate ON evidence(gate)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_evidence_timestamp ON evidence(timestamp)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_evidence_rule ON evidence(rule)');
  }

  insert(record: EvidenceRecord): void {
    this.db.run(
      `INSERT OR REPLACE INTO evidence (id, gate, timestamp, passed, rule, findingId, message, chainHash, previousHash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [record.id, record.gate, record.timestamp, record.passed ? 1 : 0,
       record.rule || null, record.findingId || null, record.message || null,
       record.chainHash || null, record.previousHash || null]
    );
  }

  queryByGate(gate: string, limit: number = 50): EvidenceRecord[] {
    return this.db.query(
      'SELECT * FROM evidence WHERE gate = ? ORDER BY timestamp DESC LIMIT ?'
    ).all(gate, limit) as EvidenceRecord[];
  }

  queryByRule(rule: string, limit: number = 50): EvidenceRecord[] {
    return this.db.query(
      'SELECT * FROM evidence WHERE rule = ? ORDER BY timestamp DESC LIMIT ?'
    ).all(rule, limit) as EvidenceRecord[];
  }

  queryRecent(limit: number = 100): EvidenceRecord[] {
    return this.db.query(
      'SELECT * FROM evidence ORDER BY timestamp DESC LIMIT ?'
    ).all(limit) as EvidenceRecord[];
  }

  count(): number {
    const row = this.db.query('SELECT COUNT(*) as c FROM evidence').get() as { c: number } | null;
    return row?.c || 0;
  }

  countByGate(gate: string): number {
    const row = this.db.query('SELECT COUNT(*) as c FROM evidence WHERE gate = ?').get(gate) as { c: number } | null;
    return row?.c || 0;
  }

  // Merkle chain verification
  verifyChain(): { valid: boolean; brokenLinks: number; totalBlocks: number } {
    const rows = this.db.query(
      'SELECT id, chainHash, previousHash FROM evidence ORDER BY timestamp ASC'
    ).all() as Array<{ id: string; chainHash: string | null; previousHash: string | null }>;

    let brokenLinks = 0;
    let previousHash: string | null = null;

    for (const row of rows) {
      if (row.previousHash && row.previousHash !== previousHash) {
        brokenLinks++;
      }
      previousHash = row.chainHash;
    }

    return { valid: brokenLinks === 0, brokenLinks, totalBlocks: rows.length };
  }

  close(): void {
    this.db.close();
  }
}

// ── Singleton (wired from evidence-pipeline.ts) ─────────────
let _edb: EvidenceDB | null = null;
export function setEvidenceDB(db: EvidenceDB): void { _edb = db; }
export function getEvidenceDB(): EvidenceDB | null { return _edb; }
