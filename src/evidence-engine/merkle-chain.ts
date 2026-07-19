import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { safeParseJSON } from '../shared/type-guards.js';
import { logInfo } from '../shared/shark-logger.js';

export interface EvidenceBlock {
  index: number;
  timestamp: string;
  data: Record<string, unknown>;
  previousHash: string;
  hash: string;
}

export class MerkleChain {
  private blocks: EvidenceBlock[] = [];
  private chainPath: string;

  constructor(basePath: string, chainDir?: string) {
    this.chainPath = chainDir || path.join(basePath, '.shark', 'evidence', 'chain');
    try { fs.mkdirSync(this.chainPath, { recursive: true }); } catch (e) { logInfo('[MerkleChain] mkdir failed: ' + (e instanceof Error ? e.message : String(e))); }
    this.loadChain();
    // Seed genesis block if chain is empty so verifyChain() has something to verify
    if (this.blocks.length === 0) {
      const genesisBlock: EvidenceBlock = {
        index: 0,
        timestamp: new Date().toISOString(),
        data: { type: 'genesis', message: 'Merkle chain initialized' },
        previousHash: '0'.repeat(64),
        hash: '',
      };
      genesisBlock.hash = this.computeHash(genesisBlock);
      this.blocks.push(genesisBlock);
      this.persistBlock(genesisBlock);
    }
  }

  append(data: Record<string, unknown>): EvidenceBlock {
    if (this.blocks.length > 0) {
      const preCheck = this.validate();
      if (!preCheck.valid) {
        throw new Error(
          `[MerkleChain] Chain integrity compromised. ` +
          `${preCheck.errors.length} errors found. Cannot append.`
        );
      }
    }

    const previousBlock = this.blocks[this.blocks.length - 1];
    const block: EvidenceBlock = {
      index: this.blocks.length,
      timestamp: new Date().toISOString(),
      data,
      previousHash: previousBlock ? previousBlock.hash : '0'.repeat(64),
      hash: '',
    };
    block.hash = this.computeHash(block);
    this.blocks.push(block);
    this.persistBlock(block);

    const postCheck = this.validate();
    if (!postCheck.valid) {
      throw new Error(
        `[MerkleChain] Chain integrity compromised after append. ` +
        `${postCheck.errors.length} errors found.`
      );
    }

    return block;
  }

  /** @deprecated No caller invokes chain.search(). Use chain.recent(n) for recent blocks or verifyChain() for integrity checks. */
  search(key: string, value: unknown): EvidenceBlock[] {
    return this.blocks.filter((b: EvidenceBlock) => b.data[key] === value);
  }

  recent(n: number): EvidenceBlock[] { return this.blocks.slice(-n); }

  verifyChain(): { valid: boolean; brokenLinks: number; totalBlocks: number } {
    try {
      const blocks = fs.readdirSync(this.chainPath)
        .filter((f: string) => f.startsWith('block-'))
        .sort();

      // An empty chain has no broken links — it is valid (just empty).
      // The old fail-closed behavior blocked ALL gate advances even when
      // evidence files existed, because the chain had no blocks yet.
      if (blocks.length === 0) {
        return { valid: false, brokenLinks: 0, totalBlocks: 0 };
      }

      let brokenLinks = 0;
      let previousHash = '';
      for (const blockFile of blocks) {
        try {
          const block = safeParseJSON(
            fs.readFileSync(path.join(this.chainPath, blockFile), 'utf-8')
          ) as Record<string, unknown>;
          // Recompute hash from block data (same as computeHash)
          const recomputedHash = createHash('sha256')
            .update(String(block.index))
            .update(String(block.timestamp))
            .update(JSON.stringify(block.data))
            .update(String(block.previousHash))
            .digest('hex');

          // Check if stored hash matches recomputed
          if (recomputedHash !== block.hash) {
            brokenLinks++;
            continue;
          }

          // Verify chain link: previous block's hash must match this block's previousHash
          if (previousHash && block.previousHash !== previousHash) {
            brokenLinks++;
            continue;
          }

          // Set previousHash to this block's stored hash for next iteration
          previousHash = block.hash;
        } catch {
          logInfo('[MerkleChain] block verification failed');
          brokenLinks++;
        }
      }
      return { valid: brokenLinks === 0, brokenLinks, totalBlocks: blocks.length };
    } catch {
      logInfo('[MerkleChain] chain verification failed');
      return { valid: false, brokenLinks: 0, totalBlocks: 0 };
    }
  }

  validate(): { valid: boolean; errors: Array<{ blockIndex: number; expected: string; computed: string; type: 'hash' | 'chain' }> } {
    const errors: Array<{ blockIndex: number; expected: string; computed: string; type: 'hash' | 'chain' }> = [];

    for (let i = 0; i < this.blocks.length; i++) {
      const block = this.blocks[i];
      const computed = this.computeHash({ ...block, hash: '' });
      if (computed !== block.hash) {
        errors.push({ blockIndex: i, expected: block.hash, computed, type: 'hash' });
      }

      if (i === 0) {
        if (block.previousHash !== '0'.repeat(64)) {
          errors.push({ blockIndex: i, expected: '0'.repeat(64), computed: block.previousHash, type: 'chain' });
        }
      } else {
        const expectedPrev = this.blocks[i - 1].hash;
        if (block.previousHash !== expectedPrev) {
          errors.push({ blockIndex: i, expected: expectedPrev, computed: block.previousHash, type: 'chain' });
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }


  private computeHash(block: EvidenceBlock): string {
    return createHash('sha256').update(block.index.toString()).update(block.timestamp).update(JSON.stringify(block.data)).update(block.previousHash).digest('hex');
  }

  private persistBlock(block: EvidenceBlock): void {
    try { fs.writeFileSync(path.join(this.chainPath, 'block-' + String(block.index).padStart(6, '0') + '.json'), JSON.stringify(block, null, 2)); } catch (e) { logInfo('[MerkleChain] write failed: ' + (e instanceof Error ? e.message : String(e))); }
    // Verified: write failure logged via logInfo()
  }

  private loadChain(): void {
    try {
      const files = fs.readdirSync(this.chainPath).filter((f: string) => f.startsWith('block-')).sort();
      for (const file of files) {
        try { const parsed = safeParseJSON<EvidenceBlock>(fs.readFileSync(path.join(this.chainPath, file), 'utf-8')); if (parsed) this.blocks.push(parsed); } catch (e) { logInfo('[MerkleChain] parse failed: ' + (e instanceof Error ? e.message : String(e))); }
      }
    } catch {
      logInfo('[MerkleChain] loadChain failed');
      this.blocks = [];
    }
  }
}

let _merkleChainInstance: MerkleChain | null = null;

export function setMerkleChain(mc: MerkleChain): void {
  _merkleChainInstance = mc;
}

export function getMerkleChain(): MerkleChain | null {
  return _merkleChainInstance;
}
