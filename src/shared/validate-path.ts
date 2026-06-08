export function validatePath(p: unknown, allowAbsolute = false): string {
  if (!p || typeof p !== 'string') throw new Error(`[PATH-REJECTED] empty or non-string path`);
  if (p.includes('../') || p.includes('..\\')) throw new Error(`[PATH-REJECTED] path traversal detected: ${p}`);
  if (!allowAbsolute && p.startsWith('/')) throw new Error(`[PATH-REJECTED] absolute path not allowed: ${p}`);
  if (/[;&|`$(){}]/.test(p)) throw new Error(`[PATH-REJECTED] shell metacharacters in path: ${p}`);
  return p;
}
