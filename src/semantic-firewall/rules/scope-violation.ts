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
    // Verified: directory access failure returns early (no files to snapshot)
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (exclude.some((e: string) => fullPath.includes(e))) continue;
      if (entry.isDirectory()) { walk(fullPath); continue; }
      try {
        const content = fs.readFileSync(fullPath);
        snapshots.push({ path: fullPath, hash: createHash('sha256').update(content).digest('hex'), mtime: fs.statSync(fullPath).mtimeMs });
      } catch { continue; }
    // Verified: stat failure skips file (continue iteration)
    }
  }
  walk(path.resolve(rootDir));
  return snapshots.sort((a: FileSnapshot, b: FileSnapshot) => a.path.localeCompare(b.path));
}
export function diffSnapshots(before: FileSnapshot[], after: FileSnapshot[], allowedScope: string[]): ScopeViolation[] {
  const violations: ScopeViolation[] = [];
  const isAllowed = (filePath: string) =>
    allowedScope.some((s: string) => filePath === s || filePath.startsWith(s + path.sep));
  const beforeMap = new Map(before.map((s: FileSnapshot) => [s.path, s]));
  for (const afterSnap of after) {
    const beforeSnap = beforeMap.get(afterSnap.path);
    if (beforeSnap && beforeSnap.hash !== afterSnap.hash) {
      if (!isAllowed(afterSnap.path)) violations.push({ file: afterSnap.path, reason: 'unexpected-change', expected: allowedScope.join(', '), actual: afterSnap.path });
    }
    if (!beforeSnap) {
      if (!isAllowed(afterSnap.path)) violations.push({ file: afterSnap.path, reason: 'outside-project', expected: allowedScope.join(', '), actual: 'New file: ' + afterSnap.path });
    }
  }
  // Check for deleted files (exist in before, missing in after)
  const afterPaths = new Set(after.map((f: FileSnapshot) => f.path));
  for (const beforeSnap of before) {
    if (!afterPaths.has(beforeSnap.path)) {
      // File was deleted
      if (!allowedScope.some((s: string) => beforeSnap.path === s || beforeSnap.path.startsWith(s + path.sep))) {
        violations.push({
          file: beforeSnap.path,
          reason: 'outside-project',
          expected: 'within project scope',
          actual: 'deleted file outside project scope',
        });
      } else {
        violations.push({
          file: beforeSnap.path,
          reason: 'unexpected-change',
          expected: 'file exists',
          actual: 'file deleted',
        });
      }
    }
  }
  return violations;
}
