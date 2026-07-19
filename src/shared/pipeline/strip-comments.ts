/**
 * Shared comment stripping utility.
 * Caches per-content for performance (bounded to prevent memory leaks).
 * Used by all T1 detectors and pipeline Phase 0.
 *
 * Handles:
 *   - Line comments (// ... \n)
 *   - Block comments (/* ... *\/)
 *   - String literals ('...', "...", `...`) — comments inside strings are preserved
 *   - Escape sequences inside strings (\n, \', \", etc.)
 */

const MAX_CACHE_SIZE = 256;
const cache = new Map<string, string>();

export function stripComments(code: string): string {
  const cached = cache.get(code);
  if (cached !== undefined) return cached;

  let result = '';
  let i = 0;
  let inString: string | null = null;

  while (i < code.length) {
    // Handle string literals — preserve everything inside, including // and /*
    if (inString) {
      result += code[i];
      if (code[i] === '\\') {
        result += code[i + 1] || '';
        i += 2;
        continue;
      }
      if (code[i] === inString) inString = null;
      i++;
      continue;
    }
    // Detect string start
    if (code[i] === '"' || code[i] === "'" || code[i] === '`') {
      inString = code[i];
      result += code[i];
      i++;
      continue;
    }
    // Line comment — skip to end of line
    if (code[i] === '/' && code[i + 1] === '/') {
      while (i < code.length && code[i] !== '\n') i++;
      continue;
    }
    // Block comment — skip to closing */
    if (code[i] === '/' && code[i + 1] === '*') {
      i += 2;
      while (i < code.length - 1 && !(code[i] === '*' && code[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    result += code[i];
    i++;
  }

  // Bounded cache — evict oldest entry when at capacity
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(code, result);
  return result;
}

export function stripCommentsOnce(code: string): string {
  return stripComments(code);
}
