/**
 * src/eie/nodes/persistence-nodes.ts — 15 Persistence Knowledge Nodes
 *
 * From KB-04:
 * - SQLite WAL mode
 * - Merkle hash chain
 * - Event sourcing
 * - Append-only log
 * - Content-addressed storage
 * - Myers diff
 * - Evidence collection
 *
 * Source: KB-04_PERSISTENCE_STORAGE.md
 */

import type { KnowledgeNode } from '../types';

// ══ SQLITE WAL MODE (2 nodes) ══════════════════════════════════

export const PERSIST_SQLITE_WAL: KnowledgeNode = {
  id: 'PERSIST-SQLITE-WAL',
  source: 'alg-sys',
  sourceFile: 'KB-04_PERSISTENCE.md',
  category: 'persistence',
  rule: 'SQLITE WAL MODE: Write-Ahead Logging enables concurrent readers + single writer. Set PRAGMA journal_mode=WAL.',
  detectionMethod: 'Find SQLite initialization without WAL mode. Flag.',
  fixTemplate: 'db.pragma("journal_mode = WAL"); db.pragma("synchronous = NORMAL"); db.pragma("busy_timeout = 5000");',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'PERSIST-SQLITE-WAL: SQLite without WAL mode. Set journal_mode=WAL.',
  warheadTemplate: 'WAL mode enables concurrent read access without blocking writes.',
  evidenceSpec: { id: 'sqlite-wal', verify: 'fs-check', minQuality: 0.90 },
  severity: 'warn',
  layer: 3,
  links: ['PERSIST-APPEND-ONLY', 'PERSIST-EVIDENCE-COLLECT'],
  selfVerified: true,
};

export const PERSIST_SQLITE_MIGRATION: KnowledgeNode = {
  id: 'PERSIST-SQLITE-MIGRATION',
  source: 'alg-sys',
  sourceFile: 'KB-04_PERSISTENCE.md',
  category: 'persistence',
  rule: 'SQLITE MIGRATION: Schema migrations must be versioned and atomic. Never modify schema without migration.',
  detectionMethod: 'Find schema changes without version tracking. Flag.',
  fixTemplate: 'CREATE TABLE IF NOT EXISTS schema_version (version INTEGER); INSERT OR IGNORE INTO schema_version VALUES (0); Apply migrations in order.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD'] }],
  bulletTemplate: 'PERSIST-SQLITE-MIGRATION: Schema change without migration. Add versioned migration.',
  warheadTemplate: 'Versioned migrations enable safe schema evolution without data loss.',
  evidenceSpec: { id: 'sqlite-migration', verify: 'fs-check', minQuality: 0.90 },
  severity: 'warn',
  layer: 3,
  links: ['PERSIST-SQLITE-WAL'],
  selfVerified: true,
};

// ══ MERKLE HASH CHAIN (3 nodes) ════════════════════════════════

export const PERSIST_MERKLE_CHAIN: KnowledgeNode = {
  id: 'PERSIST-MERKLE-CHAIN',
  source: 'alg-sys',
  sourceFile: 'KB-04_PERSISTENCE.md',
  category: 'persistence',
  rule: 'MERKLE HASH CHAIN: Tamper-evident chain of SHA-256 hashes. Each entry includes hash of previous entry.',
  detectionMethod: 'Find evidence chains without Merkle verification. Flag.',
  fixTemplate: 'class MerkleChain { add(data: unknown): string { const prevHash = this.lastHash ?? "0".repeat(64); const hash = sha256(prevHash + JSON.stringify(data)); this.chain.push({ hash, data, prevHash }); return hash; } verify(): boolean { /* recompute and compare */ } }',
  conditions: [{ field: 'gate', op: 'in', value: ['VERIFY', 'AUDIT', 'DELIVERY'] }],
  bulletTemplate: 'PERSIST-MERKLE-CHAIN: Evidence without tamper-evident chain. Add Merkle hashing.',
  warheadTemplate: 'Merkle chains provide cryptographic proof that evidence has not been tampered with.',
  evidenceSpec: { id: 'merkle-chain', verify: 'diff-check', minQuality: 0.99 },
  severity: 'block',
  layer: 5,
  links: ['IL01-OUTPUT-IS-REALITY', 'IL15-EVIDENCE-TRIPLE-RULE', 'PERSIST-APPEND-ONLY'],
  selfVerified: true,
};

export const PERSIST_MERKLE_TREE: KnowledgeNode = {
  id: 'PERSIST-MERKLE-TREE',
  source: 'alg-sys',
  sourceFile: 'KB-04_PERSISTENCE.md',
  category: 'persistence',
  rule: 'MERKLE TREE: Binary tree of hashes. Leaf nodes = file hashes. Internal nodes = hash of children. Root = snapshot identifier.',
  detectionMethod: 'Find filesystem snapshots without Merkle tree. Flag.',
  fixTemplate: 'function buildMerkleTree(files: string[]): string { const leaves = files.map(f => sha256(readFileSync(f))); return buildTreeFromLeaves(leaves); }',
  conditions: [{ field: 'gate', op: 'in', value: ['VERIFY', 'AUDIT'] }],
  bulletTemplate: 'PERSIST-MERKLE-TREE: No Merkle tree for filesystem snapshot. Build tree of file hashes.',
  warheadTemplate: 'Merkle trees enable efficient filesystem diff comparison for claim-reality verification.',
  evidenceSpec: { id: 'merkle-tree', verify: 'diff-check', minQuality: 0.99 },
  severity: 'warn',
  layer: 5,
  links: ['PERSIST-MERKLE-CHAIN', 'AO5-EXECUTION-VERIFICATION', 'IL15-EVIDENCE-TRIPLE-RULE'],
  selfVerified: true,
};

export const PERSIST_MERKLE_VERIFY: KnowledgeNode = {
  id: 'PERSIST-MERKLE-VERIFY',
  source: 'alg-sys',
  sourceFile: 'KB-04_PERSISTENCE.md',
  category: 'persistence',
  rule: 'MERKLE VERIFICATION: Compare two Merkle roots to detect any filesystem change. O(1) root comparison.',
  detectionMethod: 'Find filesystem comparisons without Merkle verification. Flag.',
  fixTemplate: 'const beforeRoot = computeMerkleRoot(files); execute(); const afterRoot = computeMerkleRoot(files); const changed = beforeRoot !== afterRoot;',
  conditions: [{ field: 'gate', op: 'in', value: ['VERIFY', 'AUDIT', 'DELIVERY'] }],
  bulletTemplate: 'PERSIST-MERKLE-VERIFY: Compare Merkle roots for filesystem change detection.',
  warheadTemplate: 'Merkle root comparison is the fastest way to detect any filesystem change.',
  evidenceSpec: { id: 'merkle-verify', verify: 'diff-check', minQuality: 0.99 },
  severity: 'block',
  layer: 5,
  links: ['PERSIST-MERKLE-TREE', 'AO5-EXECUTION-VERIFICATION', 'IL01-OUTPUT-IS-REALITY'],
  selfVerified: true,
};

// ══ EVENT SOURCING (2 nodes) ══════════════════════════════════

export const PERSIST_EVENT_SOURCING: KnowledgeNode = {
  id: 'PERSIST-EVENT-SOURCING',
  source: 'alg-sys',
  sourceFile: 'KB-04_PERSISTENCE.md',
  category: 'persistence',
  rule: 'EVENT SOURCING: Store events (not state). Current state derived by replaying events. Full audit trail.',
  detectionMethod: 'Find mutable state without event log. Flag for event sourcing.',
  fixTemplate: 'class EventStore { append(event: Event): void { this.events.push(event); } getState(): State { return this.events.reduce(applyEvent, initialState); } }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'PERSIST-EVENT-SOURCING: Mutable state without event log. Use event sourcing.',
  warheadTemplate: 'Event sourcing provides full audit trail and enables state reconstruction.',
  evidenceSpec: { id: 'event-sourcing', verify: 'fs-check', minQuality: 0.90 },
  severity: 'guide',
  layer: 3,
  links: ['PERSIST-APPEND-ONLY', 'PERSIST-MERKLE-CHAIN'],
  selfVerified: true,
};

export const PERSIST_EVENT_REPLAY: KnowledgeNode = {
  id: 'PERSIST-EVENT-REPLAY',
  source: 'alg-sys',
  sourceFile: 'KB-04_PERSISTENCE.md',
  category: 'persistence',
  rule: 'EVENT REPLAY: Reconstruct state by replaying events from the beginning. Must be deterministic.',
  detectionMethod: 'Find event handlers with non-deterministic behavior (Date.now, Math.random). Flag.',
  fixTemplate: 'function replay(events: Event[]): State { return events.reduce((state, event) => applyEvent(state, event), initialState); } // applyEvent must be pure',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'PERSIST-EVENT-REPLAY: Event handler non-deterministic. Make it pure.',
  warheadTemplate: 'Deterministic event replay is essential for state reconstruction and debugging.',
  evidenceSpec: { id: 'event-replay', verify: 'fs-check', minQuality: 0.90 },
  severity: 'warn',
  layer: 3,
  links: ['PERSIST-EVENT-SOURCING'],
  selfVerified: true,
};

// ══ APPEND-ONLY LOG (2 nodes) ══════════════════════════════════

export const PERSIST_APPEND_ONLY: KnowledgeNode = {
  id: 'PERSIST-APPEND-ONLY',
  source: 'alg-sys',
  sourceFile: 'KB-04_PERSISTENCE.md',
  category: 'persistence',
  rule: 'APPEND-ONLY LOG: Entries can only be appended, never modified or deleted. Ensures immutability.',
  detectionMethod: 'Find log implementations with update/delete operations. Flag.',
  fixTemplate: 'class AppendOnlyLog { append(entry: Entry): number { return this.entries.push(entry) - 1; } // No update or delete methods }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'PERSIST-APPEND-ONLY: Log with update/delete. Make append-only.',
  warheadTemplate: 'Append-only logs provide tamper-evidence for audit trails.',
  evidenceSpec: { id: 'append-only', verify: 'fs-check', minQuality: 0.95 },
  severity: 'warn',
  layer: 3,
  links: ['PERSIST-MERKLE-CHAIN', 'PERSIST-EVENT-SOURCING', 'SEC-AUDIT-TRAIL'],
  selfVerified: true,
};

export const PERSIST_LOG_ROTATION: KnowledgeNode = {
  id: 'PERSIST-LOG-ROTATION',
  source: 'alg-sys',
  sourceFile: 'KB-04_PERSISTENCE.md',
  category: 'persistence',
  rule: 'LOG ROTATION: Rotate logs at size threshold. Compress old logs. Retain N rotations. Never lose entries.',
  detectionMethod: 'Find logs without rotation. Flag — unbounded growth.',
  fixTemplate: 'class RotatingLog { append(entry: Entry) { this.current.push(entry); if (this.currentSize > this.maxSize) this.rotate(); } rotate() { this.archives.unshift(this.current); if (this.archives.length > this.maxArchives) this.archives.pop(); this.current = []; } }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD'] }],
  bulletTemplate: 'PERSIST-LOG-ROTATION: Log without rotation. Add size-based rotation.',
  warheadTemplate: 'Log rotation prevents disk exhaustion while retaining history.',
  evidenceSpec: { id: 'log-rotation', verify: 'fs-check', minQuality: 0.90 },
  severity: 'guide',
  layer: 3,
  links: ['PERSIST-APPEND-ONLY'],
  selfVerified: true,
};

// ══ CONTENT-ADDRESSED STORAGE (2 nodes) ════════════════════════

export const PERSIST_CONTENT_ADDRESS: KnowledgeNode = {
  id: 'PERSIST-CONTENT-ADDRESS',
  source: 'alg-sys',
  sourceFile: 'KB-04_PERSISTENCE.md',
  category: 'persistence',
  rule: 'CONTENT-ADDRESSED STORAGE: Store content by its hash. SHA-256(content) = key. Automatic deduplication.',
  detectionMethod: 'Find storage using sequential IDs instead of content hash. Flag.',
  fixTemplate: 'function store(content: Uint8Array): string { const hash = sha256(content); writeFileSync(path.join(storeDir, hash), content); return hash; }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'PERSIST-CONTENT-ADDRESS: Storage by sequential ID. Use content hash.',
  warheadTemplate: 'Content-addressed storage provides automatic deduplication and integrity verification.',
  evidenceSpec: { id: 'content-address', verify: 'fs-check', minQuality: 0.90 },
  severity: 'guide',
  layer: 3,
  links: ['PERSIST-MERKLE-TREE', 'PERSIST-MERKLE-CHAIN'],
  selfVerified: true,
};

export const PERSIST_CONTENT_DEDUP: KnowledgeNode = {
  id: 'PERSIST-CONTENT-DEDUP',
  source: 'alg-sys',
  sourceFile: 'KB-04_PERSISTENCE.md',
  category: 'persistence',
  rule: 'CONTENT DEDUPLICATION: If hash already exists in store, don\'t write again. Saves disk space.',
  detectionMethod: 'Find storage that writes duplicates. Flag.',
  fixTemplate: 'function store(content: Uint8Array): string { const hash = sha256(content); if (!existsSync(path.join(storeDir, hash))) writeFileSync(path.join(storeDir, hash), content); return hash; }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD'] }],
  bulletTemplate: 'PERSIST-CONTENT-DEDUP: No dedup check. Skip if hash exists.',
  warheadTemplate: 'Content deduplication eliminates redundant storage of identical content.',
  evidenceSpec: { id: 'content-dedup', verify: 'fs-check', minQuality: 0.90 },
  severity: 'guide',
  layer: 3,
  links: ['PERSIST-CONTENT-ADDRESS'],
  selfVerified: true,
};

// ══ MYERS DIFF (1 node) ═══════════════════════════════════════

export const PERSIST_MYERS_DIFF: KnowledgeNode = {
  id: 'PERSIST-MYERS-DIFF',
  source: 'alg-sys',
  sourceFile: 'KB-04_PERSISTENCE.md',
  category: 'persistence',
  rule: 'MYERS DIFF: Compute minimal edit script between two sequences. Used for before/after comparison.',
  detectionMethod: 'Find manual line-by-line comparison instead of diff. Flag.',
  fixTemplate: 'function diff(before: string[], after: string[]): DiffEntry[] { /* Myers algorithm */ }',
  conditions: [{ field: 'gate', op: 'in', value: ['VERIFY', 'AUDIT'] }],
  bulletTemplate: 'PERSIST-MYERS-DIFF: Manual comparison. Use Myers diff algorithm.',
  warheadTemplate: 'Myers diff efficiently computes the minimal set of changes between two states.',
  evidenceSpec: { id: 'myers-diff', verify: 'diff-check', minQuality: 0.90 },
  severity: 'guide',
  layer: 5,
  links: ['PERSIST-MERKLE-VERIFY', 'AO5-EXECUTION-VERIFICATION'],
  selfVerified: true,
};

// ══ EVIDENCE COLLECTION (1 node) ═══════════════════════════════

export const PERSIST_EVIDENCE_COLLECT: KnowledgeNode = {
  id: 'PERSIST-EVIDENCE-COLLECT',
  source: 'alg-sys',
  sourceFile: 'KB-04_PERSISTENCE.md',
  category: 'persistence',
  rule: 'EVIDENCE COLLECTION: Collect all gate evidence into a single archive. Include Merkle chain for integrity.',
  detectionMethod: 'Find evidence files without archiving. Flag.',
  fixTemplate: 'async function collectEvidence(evidenceDir: string): Promise<string> { const entries = readdirSync(evidenceDir); const archivePath = path.join(evidenceDir, "..", "evidence-archive.tar.gz"); // Create archive with Merkle manifest return archivePath; }',
  conditions: [{ field: 'gate', op: 'in', value: ['DELIVERY'] }],
  bulletTemplate: 'PERSIST-EVIDENCE-COLLECT: Evidence not archived. Collect into tar.gz with Merkle manifest.',
  warheadTemplate: 'Evidence collection creates a deliverable archive with cryptographic integrity proof.',
  evidenceSpec: { id: 'evidence-archive', verify: 'fs-check', minQuality: 0.99 },
  severity: 'block',
  layer: 5,
  links: ['GR-DELIVERY-EVIDENCE-ARCHIVE', 'PERSIST-MERKLE-CHAIN', 'IL15-EVIDENCE-TRIPLE-RULE'],
  selfVerified: true,
};

// ══ RELIABLE EVENT PUBLISHING & ISOLATION (2 nodes) ════════════

export const PERSIST_TRANSACTIONAL_OUTBOX: KnowledgeNode = {
  id: 'PERSIST-TRANSACTIONAL-OUTBOX',
  source: 'alg-sys',
  sourceFile: 'KB-04_PERSISTENCE.md',
  category: 'persistence',
  rule: 'TRANSACTIONAL OUTBOX: Write the domain state change AND the outbox event row in the SAME database transaction. A separate relay publishes outbox rows asynchronously. Eliminates lost/duplicate events (at-least-once delivery + idempotent consumer). Never dual-write (DB commit + external publish as separate steps) — a crash between them loses or duplicates events.',
  detectionMethod: 'Find dual-write patterns: a DB commit followed by a separate external publish (queue/HTTP/event bus) outside the same transaction. Flag — on failure the two steps diverge (lost or phantom events).',
  fixTemplate: 'await db.transaction(() => { db.prepare("UPDATE accounts SET balance = balance - ? WHERE id = ?").run(amt, id); db.prepare("INSERT INTO outbox(event_type, payload, published) VALUES(?, ?, 0)").run("debit", JSON.stringify({ id, amt })); })(); /* relay (separate process/loop): */ for (const row of db.prepare("SELECT * FROM outbox WHERE published = 0 ORDER BY id").all()) { await bus.publish(row.event_type, JSON.parse(row.payload)); db.prepare("UPDATE outbox SET published = 1 WHERE id = ?").run(row.id); }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'PERSIST-TRANSACTIONAL-OUTBOX: Dual-write (DB + publish as separate steps). Use transactional outbox.',
  warheadTemplate: 'The transactional outbox guarantees event delivery by writing the event in the same transaction as the state change.',
  evidenceSpec: { id: 'tx-outbox', verify: 'fs-check', minQuality: 0.95 },
  severity: 'warn',
  layer: 3,
  links: ['PERSIST-EVENT-SOURCING', 'PERSIST-APPEND-ONLY', 'PERSIST-SQLITE-WAL'],
  selfVerified: true,
};

export const PERSIST_SNAPSHOT_ISOLATION: KnowledgeNode = {
  id: 'PERSIST-SNAPSHOT-ISOLATION',
  source: 'alg-sys',
  sourceFile: 'KB-04_PERSISTENCE.md',
  category: 'persistence',
  rule: 'SNAPSHOT ISOLATION: Each transaction reads a single consistent snapshot taken at its start. Prevents non-repeatable reads and read skew (seeing a partial state mid-write by a concurrent writer). Reads never block on, and are not changed by, concurrent writes within the transaction.',
  detectionMethod: 'Find long-running reads that re-read the same row(s) interleaved with concurrent writers and may observe inconsistent intermediate state (non-repeatable reads, read skew). Flag — run the read set inside one snapshot-consistent transaction (WAL + a single transaction, or REPEATABLE READ / snapshot isolation level).',
  fixTemplate: 'db.pragma("journal_mode = WAL"); const readTx = db.transaction(() => { const a = db.prepare("SELECT total FROM accounts WHERE id = ?").get(id); const b = db.prepare("SELECT total FROM accounts WHERE id = ?").get(id2); /* a and b are mutually consistent — taken from one snapshot even if a writer commits mid-read */ return { a, b }; }); const { a, b } = readTx();',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'PERSIST-SNAPSHOT-ISOLATION: Multi-read transaction seeing inconsistent state. Use snapshot isolation.',
  warheadTemplate: 'Snapshot isolation gives each transaction a stable, consistent view — reads cannot be corrupted by concurrent writes.',
  evidenceSpec: { id: 'snapshot-isolation', verify: 'fs-check', minQuality: 0.90 },
  severity: 'warn',
  layer: 3,
  links: ['PERSIST-SQLITE-WAL', 'PERSIST-EVENT-SOURCING'],
  selfVerified: true,
};

// EXPORTS
export const persistenceNodes: KnowledgeNode[] = [
  PERSIST_SQLITE_WAL, PERSIST_SQLITE_MIGRATION,
  PERSIST_MERKLE_CHAIN, PERSIST_MERKLE_TREE, PERSIST_MERKLE_VERIFY,
  PERSIST_EVENT_SOURCING, PERSIST_EVENT_REPLAY,
  PERSIST_APPEND_ONLY, PERSIST_LOG_ROTATION,
  PERSIST_CONTENT_ADDRESS, PERSIST_CONTENT_DEDUP,
  PERSIST_MYERS_DIFF,
  PERSIST_EVIDENCE_COLLECT,
  PERSIST_TRANSACTIONAL_OUTBOX, PERSIST_SNAPSHOT_ISOLATION,
];
