import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

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
    try { fs.mkdirSync(this.chainPath, { recursive: true }); } catch (e) { console.warn('[MerkleChain] mkdir failed:', e); }
    this.loadChain();
  }

  append(data: Record<string, unknown>): EvidenceBlock {
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
    return block;
  }

  search(key: string, value: unknown): EvidenceBlock[] {
    return this.blocks.filter((b: EvidenceBlock) => b.data[key] === value);
  }

  recent(n: number): EvidenceBlock[] { return this.blocks.slice(-n); }


  private computeHash(block: EvidenceBlock): string {
    return createHash('sha256').update(block.index.toString()).update(block.timestamp).update(JSON.stringify(block.data)).update(block.previousHash).digest('hex');
  }

  private persistBlock(block: EvidenceBlock): void {
    try { fs.writeFileSync(path.join(this.chainPath, 'block-' + String(block.index).padStart(6, '0') + '.json'), JSON.stringify(block, null, 2)); } catch (e) { console.warn('[MerkleChain] write failed:', e); }
  }

  private loadChain(): void {
    try {
      const files = fs.readdirSync(this.chainPath).filter((f: string) => f.startsWith('block-')).sort();
      for (const file of files) {
        try { this.blocks.push(JSON.parse(fs.readFileSync(path.join(this.chainPath, file), 'utf-8')) as EvidenceBlock); } catch (e) { console.warn('[MerkleChain] parse failed:', e); }
      }
    } catch { this.blocks = []; }
  }
}
