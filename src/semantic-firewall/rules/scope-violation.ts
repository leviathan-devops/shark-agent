import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
export interface FileSnapshot { path: string; hash: string; mtime: number; }
export interface ScopeViolation { file: string; reason: 'outside-project' | 'unexpected-change'; expected: string; actual: string; }
export function snapshotDirectory(rootDir: string, exclude: string[] = ['node_modules', '.git', 'dist']): FileSnapshot[] {
  const snapshots: FileSnapshot[] = [];
  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (exclude.some(e => fullPath.includes(e))) continue;
      if (entry.isDirectory()) { walk(fullPath); continue; }
      try {
        const content = fs.readFileSync(fullPath);
        snapshots.push({ path: fullPath, hash: createHash('sha256').update(content).digest('hex'), mtime: fs.statSync(fullPath).mtimeMs });
      } catch { continue; }
    }
  }
  walk(path.resolve(rootDir));
  return snapshots.sort((a, b) => a.path.localeCompare(b.path));
}
export function diffSnapshots(before: FileSnapshot[], after: FileSnapshot[], allowedScope: string[]): ScopeViolation[] {
  const violations: ScopeViolation[] = [];
  const beforeMap = new Map(before.map(s => [s.path, s]));
  for (const afterSnap of after) {
    const beforeSnap = beforeMap.get(afterSnap.path);
    if (beforeSnap && beforeSnap.hash !== afterSnap.hash) {
      const isInScope = allowedScope.some(s => afterSnap.path.startsWith(s));
      if (!isInScope) violations.push({ file: afterSnap.path, reason: 'unexpected-change', expected: allowedScope.join(', '), actual: afterSnap.path });
    }
    if (!beforeSnap) {
      const isInScope = allowedScope.some(s => afterSnap.path.startsWith(s));
      if (!isInScope) violations.push({ file: afterSnap.path, reason: 'unexpected-change', expected: allowedScope.join(', '), actual: 'New file: ' + afterSnap.path });
    }
  }
  return violations;
}
