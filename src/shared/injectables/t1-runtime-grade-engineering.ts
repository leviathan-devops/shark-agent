/**
 * T1 Injectable: Runtime-Grade Engineering Enforcement
 *
 * Distilled from RUNTIME_GRADE_ENGINEERING_BIBLE.md v1.0
 * P1-P12 principles mapped to semantic violation detectors.
 *
 * DESIGN RULES:
 *   - No regex-only detection — every detector checks structural context
 *   - No false positives — catch { console.error(e); cleanup(); } is VALID
 *   - Pure functions: (code, context) => boolean (true = violation detected)
 *   - Maps to EngineeringChecklist fields for execution-brain integration
 *
 * PRINCIPLE INDEX:
 *   P1  DEFENSIVE IMPORT      — verify before using
 *   P2  TYPE CERTAINTY        — validate at boundaries
 *   P3  ERROR COMPLETENESS    — catch {} is a DEFECT
 *   P4  RESOURCE LIFECYCLE    — cleanup in ALL paths
 *   P5  ATOMIC STATE          — no torn states
 *   P6  DEPENDENCY CHECK      — verify APIs exist
 *   P7  PATH RESOLUTION       — no hardcoded paths
 *   P8  CONFIG VALIDATION     — validate before use
 *   P9  ASYNC DISCIPLINE      — no floating promises
 *   P10 OUTPUT CONTRACT       — return what you promise
 *   P11 OUTPUT IS THE WORK    — don't claim work without side effects
 *   P12 EMPTY STATE GUARD     — empty collections must not produce false success
 */

// ═══════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════

export interface CodeContext {
  filePath: string;
  toolName: string;
  gate: string;
  surroundingCode: string;
}

export interface ViolationDetector {
  id: string;
  category: string;
  description: string;
  severity: 'critical' | 'high' | 'medium';
  detect: (code: string, context: CodeContext) => boolean;
  fix: string;
}

export interface EnforcementRule {
  detector: ViolationDetector;
  enforcementAction: 'block' | 'flag' | 'escalate';
  escalationTarget: 'execution' | 'system' | 'gate';
  autoFixable: boolean;
}

export interface EngineeringChecklistFields {
  returnTypeCorrect: boolean;
  nullSafetyHandled: boolean;
  errorPathsComplete: boolean;
  resourceCleanupAllPaths: boolean;
  concurrentSafety: boolean;
  importValidity: boolean;
  pathResolution: boolean;
  configValidated: boolean;
  typeAssertionsGuarded: boolean;
  asyncDiscipline: boolean;
  crossSystemDataContractsValidated: boolean;
  coupledDataConsistencyVerified: boolean;
  gridDataIntegrityVerified: boolean;
}

// ═══════════════════════════════════════════════
// STRUCTURAL HELPERS
// ═══════════════════════════════════════════════

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findMatchingBrace(code: string, openIdx: number): number | null {
  if (openIdx >= code.length || code[openIdx] !== '{') return null;
  let depth = 0;
  let inStr: string | null = null;
  let esc = false;
  for (let i = openIdx; i < code.length; i++) {
    const c = code[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (inStr) {
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return null;
}

function extractBlock(code: string, openBraceIdx: number): string | null {
  const close = findMatchingBrace(code, openBraceIdx);
  return close !== null ? code.substring(openBraceIdx + 1, close) : null;
}

function stripComments(src: string): string {
  let result = '';
  let i = 0;
  while (i < src.length) {
    if (src[i] === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (src[i] === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length - 1 && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
    } else {
      result += src[i];
      i++;
    }
  }
  return result;
}

function getPrecedingScope(code: string, position: number, chars: number): string {
  const start = Math.max(0, position - chars);
  return code.substring(start, position);
}

function hasMeaningfulStatements(body: string): boolean {
  const cleaned = stripComments(body).trim();
  if (cleaned.length === 0) return false;
  const hasCall = /\b\w+\s*\(/.test(cleaned);
  const hasThrow = /\bthrow\b/.test(cleaned);
  const hasReturn = /\breturn\b/.test(cleaned);
  const hasPropertyWrite = /\b\w+\.\w+\s*=/.test(cleaned);
  return hasCall || hasThrow || hasReturn || hasPropertyWrite;
}

function findCatchBlocks(code: string): Array<{ body: string; index: number }> {
  const results: Array<{ body: string; index: number }> = [];
  const catchRe = /\bcatch\s*(?:\(\s*\w+\s*\))?\s*\{/g;
  let m;
  while ((m = catchRe.exec(code)) !== null) {
    const braceIdx = code.indexOf('{', m.index);
    if (braceIdx === -1) continue;
    const body = extractBlock(code, braceIdx);
    if (body !== null) results.push({ body, index: m.index });
  }
  return results;
}

function findEnclosingFunctionStart(code: string, position: number): number | null {
  let depth = 0;
  for (let i = position - 1; i >= 0; i--) {
    if (code[i] === '}') depth++;
    else if (code[i] === '{') {
      if (depth > 0) { depth--; continue; }
      const before = code.substring(Math.max(0, i - 100), i);
      if (/(?:function\s+\w+|(?:const|let)\s+\w+\s*=\s*(?:async\s+)?.*\)|=>)\s*$/.test(before)) {
        return i;
      }
    }
  }
  return null;
}

// ═══════════════════════════════════════════════
// P1: DEFENSIVE IMPORT
// ═══════════════════════════════════════════════

export const P1_DEFENSIVE_IMPORT: ViolationDetector = {
  id: 'P1',
  category: 'import-safety',
  description: 'Defensive Import — named imports from relative paths without existence verification',
  severity: 'high',
  detect(code: string, _ctx: CodeContext): boolean {
    const relImportRe = /import\s+\{([^}]+)\}\s+from\s+['"](\.\.?\/[^'"]+)['"]/g;
    let m;
    while ((m = relImportRe.exec(code)) !== null) {
      const namedList = m[1];
      const importEnd = m.index + m[0].length;
      const symbols = namedList.split(',').map((s: string) => {
        const parts = s.trim().split(/\s+as\s+/);
        return (parts[parts.length - 1] || '').trim();
      }).filter(Boolean);

      for (const sym of symbols) {
        const codeAfterImport = code.substring(importEnd);
        const usageRe = new RegExp(`\\b${escapeRegex(sym)}\\b`, 'g');
        const firstUse = usageRe.exec(codeAfterImport);
        if (!firstUse) continue;

        const region = code.substring(importEnd, importEnd + firstUse.index);
        const guardRe = new RegExp(
          `typeof\\s+${escapeRegex(sym)}|` +
          `${escapeRegex(sym)}\\s*(?:===|!==)\\s*undefined|` +
          `${escapeRegex(sym)}\\s*\\?\\.|` +
          `if\\s*\\(.*${escapeRegex(sym)}`
        );
        if (!guardRe.test(region)) return true;
      }
    }
    return false;
  },
  fix: 'Use `import * as mod from "./path"` and verify with `if (typeof mod.func !== "function") throw new Error("Missing export: func");`',
};

// ═══════════════════════════════════════════════
// P2: TYPE CERTAINTY
// ═══════════════════════════════════════════════

export const P2_TYPE_CERTAINTY: ViolationDetector = {
  id: 'P2',
  category: 'type-safety',
  description: 'Type Certainty — unguarded `as` casts without preceding runtime type validation',
  severity: 'critical',
  detect(code: string, ctx: CodeContext): boolean {
    const castRe = /\bas\s+(?!const\b(?:\s*;|\s*\.|\s*\)|\s*,|\s*\}|$))(\w+)/g;
    let m;
    while ((m = castRe.exec(code)) !== null) {
      const castPos = m.index;
      const preceding = getPrecedingScope(code, castPos, 500);
      const guardPatterns = [
        /\btypeof\s+\w+\s*[!=]==?\s*['"](?:string|number|boolean|function|object|undefined)['"]/,
        /\binstanceof\s+\w+/,
        /\bArray\.isArray\s*\(/,
        /\bObject\.keys\s*\(/,
        /\bObject\.hasOwn\s*\(/,
        /\bReflect\.has\s*\(/,
        /\w+\s*!==?\s*(?:null|undefined)/,
        /\w+\s*===?\s*(?:null|undefined)/,
        /\btypeof\s+\w+\s*[!=]==?\s*['"]\w+/,
        /!\s*[\w.]+\s*$/,
      ];
      const guarded = guardPatterns.some((p: RegExp) => p.test(preceding));
      if (!guarded) return true;
    }

    if (ctx.gate === 'BUILD' || ctx.gate === 'VERIFY') {
      const funcAnyRe = /\b(?:function|(?:const|let)\s+\w+\s*=\s*(?:async\s+)?)\s*\w+\s*\([^)]*:\s*any\b/g;
      if (funcAnyRe.test(code)) return true;
    }

    return false;
  },
  fix: 'Before every `as` cast, add a runtime type guard: `if (typeof val === "object" && val !== null)` or use `instanceof` / `Array.isArray`. Use `unknown` instead of `any` at boundaries.',
};

// ═══════════════════════════════════════════════
// P3: ERROR PATH COMPLETENESS
// ═══════════════════════════════════════════════

export const P3_ERROR_COMPLETENESS: ViolationDetector = {
  id: 'P3',
  category: 'error-handling',
  description: 'Error Completeness — catch blocks without meaningful handling (log, recover, or propagate)',
  severity: 'critical',
  detect(code: string, _ctx: CodeContext): boolean {
    const catchBlocks = findCatchBlocks(code);
    for (const { body } of catchBlocks) {
      if (!hasMeaningfulStatements(body)) return true;
    }
    return false;
  },
  fix: 'Every catch must: (1) log the error with context, (2) recover with a fallback, or (3) re-throw with added context. `catch {}` and `catch (e) {}` are always defects.',
};

// ═══════════════════════════════════════════════
// P4: RESOURCE LIFECYCLE
// ═══════════════════════════════════════════════

export const P4_RESOURCE_LIFECYCLE: ViolationDetector = {
  id: 'P4',
  category: 'resource-management',
  description: 'Resource Lifecycle — acquired resources (intervals, file handles, listeners) without cleanup in all paths',
  severity: 'critical',
  detect(code: string, _ctx: CodeContext): boolean {
    const acquisitions: Array<{ acquire: string; cleanup: string; criticalOnly: boolean; pattern: RegExp }> = [
      { acquire: 'setInterval', cleanup: 'clearInterval', criticalOnly: false, pattern: /setInterval\s*\(/g },
      { acquire: 'setTimeout', cleanup: 'clearTimeout', criticalOnly: false, pattern: /const\s+\w+\s*=\s*setTimeout\s*\(/g },
      { acquire: 'openSync', cleanup: 'closeSync', criticalOnly: false, pattern: /openSync\s*\(/g },
      { acquire: 'createReadStream', cleanup: 'destroy', criticalOnly: true, pattern: /createReadStream\s*\(/g },
      { acquire: 'createWriteStream', cleanup: 'destroy', criticalOnly: true, pattern: /createWriteStream\s*\(/g },
      { acquire: 'addEventListener', cleanup: 'removeEventListener', criticalOnly: true, pattern: /addEventListener\s*\(/g },
    ];

    for (const { cleanup, criticalOnly, pattern } of acquisitions) {
      pattern.lastIndex = 0;
      let m;
      while ((m = pattern.exec(code)) !== null) {
        const after = code.substring(m.index);
        const cleanupRe = new RegExp(`\\b${cleanup}\\b`);
        if (!cleanupRe.test(after)) return true;

        if (!criticalOnly) {
          const finallyRe = /\bfinally\s*\{/g;
          let hasFinallyWithCleanup = false;
          let fm;
          while ((fm = finallyRe.exec(code)) !== null) {
            if (fm.index > m.index) {
              const braceIdx = code.indexOf('{', fm.index);
              if (braceIdx === -1) continue;
              const finallyBody = extractBlock(code, braceIdx);
              if (finallyBody && cleanupRe.test(finallyBody)) {
                hasFinallyWithCleanup = true;
                break;
              }
            }
          }
          if (!hasFinallyWithCleanup) return true;
        }
      }
    }
    return false;
  },
  fix: 'Wrap resource usage in try/finally: `const iv = setInterval(fn, 100); try { await work(); } finally { clearInterval(iv); }` — cleanup runs even on throw.',
};

// ═══════════════════════════════════════════════
// P5: ATOMIC STATE TRANSITIONS
// ═══════════════════════════════════════════════

export const P5_ATOMIC_STATE: ViolationDetector = {
  id: 'P5',
  category: 'state-management',
  description: 'Atomic State — sequential property mutations with interleaved async operations and no try/catch',
  severity: 'critical',
  detect(code: string, _ctx: CodeContext): boolean {
    const sequentialAssignRe = /(\b\w+)\s*\.\s*(\w+)\s*=[^;]+;\s*\n?\s*\1\s*\.\s*(\w+)\s*=\s*(?:await\s|)/g;
    let m;
    while ((m = sequentialAssignRe.exec(code)) !== null) {
      const objName = m[1];
      const region = code.substring(Math.max(0, m.index - 300), m.index + m[0].length + 300);
      const hasAwaitBetween = /;\s*\n?\s*\w+\s*\.\s*\w+\s*=\s*await\s/.test(m[0]);
      if (!hasAwaitBetween) continue;
      const hasTry = /\btry\s*\{/.test(region);
      if (!hasTry) return true;
    }

    const loadingPattern = /(\b\w+)\s*\.\s*(loading|pending|busy|fetching)\s*=\s*true\s*;/g;
    let lm;
    while ((lm = loadingPattern.exec(code)) !== null) {
      const objName = lm[1];
      const after = code.substring(lm.index);
      const resetRe = new RegExp(
        `${escapeRegex(objName)}\\s*\\.\\s*(loading|pending|busy|fetching)\\s*=\\s*false`
      );
      const resetMatch = resetRe.exec(after);
      if (resetMatch) {
        const between = after.substring(0, resetMatch.index);
        const awaitBetween = /\bawait\b/.test(between);
        const tryBetween = /\btry\s*\{/.test(between);
        const finallyBetween = /\bfinally\s*\{/.test(between);
        if (awaitBetween && !tryBetween && !finallyBetween) return true;
      }
    }

    return false;
  },
  fix: 'Assign state atomically: `state = { ...prev, loading: false, data, error: null }` inside try/catch. Never set loading=true before await without a finally to reset it.',
};

// ═══════════════════════════════════════════════
// P6: DEPENDENCY VERIFICATION
// ═══════════════════════════════════════════════

export const P6_DEPENDENCY_VERIFICATION: ViolationDetector = {
  id: 'P6',
  category: 'dependency-safety',
  description: 'Dependency Verification — external API calls without existence checks at boundaries',
  severity: 'high',
  detect(code: string, _ctx: CodeContext): boolean {
    const criticalApis: Array<{ pattern: RegExp; guard: RegExp }> = [
      {
        pattern: /\bfs\s*\.\s*readFileSync\s*\(/,
        guard: /\bfs\s*\.\s*existsSync\s*\(|typeof\s+fs\s*[!=]==?\s*['"]object['"]|fs\s*\?\s*\.\s*readFileSync/,
      },
      {
        pattern: /\bfs\s*\.\s*readFile\s*\(/,
        guard: /\bfs\s*\.\s*(?:existsSync|access|stat)\s*\(|fs\s*\?\s*\.\s*readFile/,
      },
      {
        pattern: /\bcrypto\s*\.\s*randomBytes\s*\(/,
        guard: /\btypeof\s+crypto|crypto\s*\?\s*\.\s*randomBytes|crypto\s*\.\s*webcrypto/,
      },
    ];

    for (const { pattern, guard } of criticalApis) {
      if (pattern.test(code) && !guard.test(code)) return true;
    }

    const dynamicRequireRe = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    let dm;
    while ((dm = dynamicRequireRe.exec(code)) !== null) {
      const surrounding = code.substring(Math.max(0, dm.index - 100), dm.index + dm[0].length + 100);
      const hasTry = /\btry\s*\{/.test(surrounding) || /\btry\s*\{/.test(getPrecedingScope(code, dm.index, 200));
      if (!hasTry) return true;
    }

    return false;
  },
  fix: 'Verify dependencies exist before use: `if (typeof fs?.readFileSync !== "function") throw new Error("fs not available");` or wrap dynamic require in try/catch.',
};

// ═══════════════════════════════════════════════
// P7: PATH RESOLUTION
// ═══════════════════════════════════════════════

export const P7_PATH_RESOLUTION: ViolationDetector = {
  id: 'P7',
  category: 'path-safety',
  description: 'Path Resolution — hardcoded or machine-specific file paths without dynamic resolution',
  severity: 'critical',
  detect(code: string, _ctx: CodeContext): boolean {
    const hardcodedPatterns: RegExp[] = [
      /['"]\/home\/[a-zA-Z_]\w*\/[^'"]*['"]/,
      /['"]\/Users\/[a-zA-Z_]\w*\/[^'"]*['"]/,
      /['"]C:\\Users\\[a-zA-Z_]\w*\\[^'"]*['"]/,
      /['"]\/var\/www\/[^'"]*['"]/,
    ];

    for (const p of hardcodedPatterns) {
      const match = p.exec(code);
      if (match) {
        const dynamicPathRe = /\b(?:path\.(?:join|resolve)|os\.homedir\(\)|__dirname|process\.cwd\(\))/;
        if (!dynamicPathRe.test(code)) return true;
        const matchedPath = match[0];
        const isInsideDynamic = /\b(?:path\.(?:join|resolve))\s*\([^)]*['"]/.test(
          code.substring(Math.max(0, match.index - 80), match.index + matchedPath.length + 10)
        );
        if (!isInsideDynamic) return true;
      }
    }

    return false;
  },
  fix: 'Use `path.join(os.homedir(), "...")` or `path.resolve(__dirname, "...")` instead of hardcoded paths. Every path must work across environments.',
};

// ═══════════════════════════════════════════════
// P8: CONFIGURATION VALIDATION
// ═══════════════════════════════════════════════

export const P8_CONFIG_VALIDATION: ViolationDetector = {
  id: 'P8',
  category: 'config-safety',
  description: 'Configuration Validation — config/env values used without type/range/presence checks',
  severity: 'critical',
  detect(code: string, _ctx: CodeContext): boolean {
    const envRe = /\bprocess\.env\.(\w+)/g;
    const seen = new Set<string>();
    let em;
    while ((em = envRe.exec(code)) !== null) {
      const varName = em[1];
      if (seen.has(varName)) continue;
      seen.add(varName);

      const region = code.substring(Math.max(0, em.index - 150), em.index + 300);
      const varEsc = escapeRegex(varName);
      const hasCheck = new RegExp(
        `process\\.env\\.${varEsc}\\s*(?:\\?\\?|\\|\\||!==?\\s*undefined|===?\\s*undefined)|` +
        `if\\s*\\(\\s*(?:!\\s*)?process\\.env\\.${varEsc}|` +
        `const\\s+\\w+\\s*=\\s*process\\.env\\.${varEsc}\\s*(?:\\?\\?|\\|\\|)|` +
        `typeof\\s+process\\.env\\.${varEsc}`
      ).test(region);
      if (!hasCheck) return true;
    }

    const configRe = /\bconfig\s*\.\s*(port|timeout|host|url|interval|maxRetries|batchSize)\b/g;
    let cm;
    while ((cm = configRe.exec(code)) !== null) {
      const field = cm[1];
      const region = code.substring(Math.max(0, cm.index - 200), cm.index + 400);
      const fieldEsc = escapeRegex(field);
      const validationPatterns = [
        new RegExp(`typeof\\s+config\\.${fieldEsc}`),
        new RegExp(`config\\.${fieldEsc}\\s*(?:===|!==|>|<|>=|<=)`),
        new RegExp(`isNaN\\s*\\(\\s*config\\.${fieldEsc}`),
        new RegExp(`config\\.${fieldEsc}\\s*\\?\\?`),
        new RegExp(`config\\.${fieldEsc}\\s*\\|\\|`),
        new RegExp(`Number\\.is(?:Integer|Finite)\\s*\\(\\s*config\\.${fieldEsc}`),
      ];
      const hasValidation = validationPatterns.some((p: RegExp) => p.test(region));
      if (!hasValidation) {
        const criticalUse = new RegExp(
          `(?:\\.listen\\s*\\(|setTimeout\\s*\\(|setInterval\\s*\\(|fetch\\s*\\().{0,100}config\\.${fieldEsc}`
        );
        if (criticalUse.test(region)) return true;
      }
    }

    return false;
  },
  fix: 'Validate every config value before use: `const port = config.port; if (typeof port !== "number" || port < 1 || port > 65535) throw new Error("Invalid port");`',
};

// ═══════════════════════════════════════════════
// P9: ASYNC DISCIPLINE
// ═══════════════════════════════════════════════

export const P9_ASYNC_DISCIPLINE: ViolationDetector = {
  id: 'P9',
  category: 'async-safety',
  description: 'Async Discipline — floating promises, unhandled rejections, fire-and-forget async calls',
  severity: 'critical',
  detect(code: string, _ctx: CodeContext): boolean {
    const thenRe = /\.then\s*\(/g;
    let m;
    while ((m = thenRe.exec(code)) !== null) {
      const after = code.substring(m.index, Math.min(code.length, m.index + 2000));
      const stmtEnd = after.search(/[;}\n]\s*(?:\n|$|(?:const|let|var|function|class|if|for|while))/);
      const scanRegion = stmtEnd > 0 ? after.substring(0, stmtEnd) : after.substring(0, 500);
      const hasCatch = /\.catch\s*\(/.test(scanRegion);
      if (!hasCatch) {
        const preceding = getPrecedingScope(code, m.index, 600);
        const inTry = /try\s*\{[^}]*$/.test(preceding) || /try\s*\(/.test(preceding);
        if (!inTry) return true;
      }
    }

    const newPromiseRe = /new\s+Promise\s*\(\s*(?:async\s+)?(?:\([^)]*\)\s*=>|\bfunction\s*\([^)]*\))\s*\{/g;
    let pm;
    while ((pm = newPromiseRe.exec(code)) !== null) {
      const braceIdx = code.indexOf('{', pm.index);
      if (braceIdx === -1) continue;
      const body = extractBlock(code, braceIdx);
      if (body !== null) {
        const hasReject = /\breject\b/.test(body);
        const hasThrow = /\bthrow\b/.test(body);
        if (!hasReject && !hasThrow) return true;
      }
    }

    const voidAsyncRe = /\bvoid\s+(\w+)\s*\(/g;
    let vm;
    while ((vm = voidAsyncRe.exec(code)) !== null) {
      const funcName = vm[1];
      const after = code.substring(vm.index + vm[0].length, vm.index + vm[0].length + 500);
      const hasCatch = /\.catch\s*\(/.test(after);
      const funcDecl = new RegExp(`(?:async\\s+function\\s+${escapeRegex(funcName)}|const\\s+${escapeRegex(funcName)}\\s*=\\s*async)`);
      const isAsync = funcDecl.test(code);
      if (isAsync && !hasCatch) return true;
    }

    return false;
  },
  fix: 'Every Promise needs error handling: use `await` with `try/catch`, or add `.catch(handler)` to `.then()` chains. No fire-and-forget async calls.',
};

// ═══════════════════════════════════════════════
// P10: OUTPUT CONTRACT
// ═══════════════════════════════════════════════

export const P10_OUTPUT_CONTRACT: ViolationDetector = {
  id: 'P10',
  category: 'contract-safety',
  description: 'Output Contract — return type mismatch in error paths (returning null where non-nullable is declared)',
  severity: 'high',
  detect(code: string, _ctx: CodeContext): boolean {
    const funcReturnRe = /(?:function\s+\w+|(?:const|let)\s+\w+\s*=\s*(?:async\s+)?(?:\([^)]*\)|\w+))\s*(?:<[^>]+>)?\s*:\s*([A-Z]\w*|string|number|boolean|object)(?:\[\])?\s*(?:=>|\{)/g;
    let m;
    while ((m = funcReturnRe.exec(code)) !== null) {
      const returnType = m[1];
      const nullableTypes = ['null', 'undefined', 'void', 'never', 'Null', 'Undefined', 'Void', 'Never'];
      if (nullableTypes.includes(returnType)) continue;
      if (/\|/.test(code.substring(m.index, m.index + m[0].length))) continue;

      const braceIdx = code.indexOf('{', m.index + m[0].length - 1);
      if (braceIdx === -1 || braceIdx < m.index) continue;
      const body = extractBlock(code, braceIdx);
      if (body === null) continue;

      const catches = findCatchBlocks(body);
      for (const cat of catches) {
        const catchStripped = stripComments(cat.body);
        if (/\breturn\s+null\b/.test(catchStripped)) return true;
        if (/\breturn\s+undefined\b/.test(catchStripped)) return true;
        if (!/\breturn\b/.test(catchStripped) && !/\bthrow\b/.test(catchStripped)) {
          const hasCall = /\w+\s*\(/.test(catchStripped);
          if (!hasCall) return true;
        }
      }
    }
    return false;
  },
  fix: 'Ensure every code path returns the declared type. In catch blocks: `throw new Error("context: " + e)` or `return fallbackValue` — never return null for a non-nullable type.',
};

// ═══════════════════════════════════════════════
// P11: OUTPUT IS THE WORK (ANTI-THEATRICAL)
// ═══════════════════════════════════════════════

export const P11_OUTPUT_IS_THE_WORK: ViolationDetector = {
  id: 'P11',
  category: 'theatrical-code',
  description: 'Output Is The Work — functions claiming success/completion without performing actual side effects',
  severity: 'critical',
  detect(code: string, _ctx: CodeContext): boolean {
    const successReturnRe = /\breturn\s*\{[^}]*(?:success|done|complete|dispersed|active|created|stored|finished|processed)\s*:\s*true/g;
    let m;
    while ((m = successReturnRe.exec(code)) !== null) {
      const funcStart = findEnclosingFunctionStart(code, m.index);
      if (funcStart === null) continue;

      const returnStatement = /\breturn\s*\{[^}]*\}/.exec(code.substring(m.index, m.index + 500));
      if (!returnStatement) continue;

      const funcBody = code.substring(funcStart, m.index);
      const beforeReturn = stripComments(funcBody);

      const hasCall = /\b\w+\s*\(/.test(beforeReturn);
      const hasFileWrite = /writeFile|mkdirSync|writeSync|createWriteStream|fs\s*\.\s*write/.test(beforeReturn);
      const hasApiCall = /fetch\(|axios|\.request\(|\.post\(|\.put\(|\.delete\(|\.patch\(/.test(beforeReturn);
      const hasSpawn = /\bspawn|exec|fork|task\(|run_subagent|runParallel/.test(beforeReturn);
      const hasSend = /\.send\s*\(|messenger\.|emit\s*\(/.test(beforeReturn);

      if (!hasCall && !hasFileWrite && !hasApiCall && !hasSpawn && !hasSend) return true;
    }

    const pathReturnRe = /\breturn\s*\{[^}]*(?:evidencePath|filePath|outputPath|resultPath|dirPath|folderPath)\s*:/g;
    let pm;
    while ((pm = pathReturnRe.exec(code)) !== null) {
      const funcStart = findEnclosingFunctionStart(code, pm.index);
      if (funcStart === null) continue;

      const returnStatement = /\breturn\s*\{[^}]*\}/.exec(code.substring(pm.index, pm.index + 500));
      if (!returnStatement) continue;

      const funcBody = code.substring(funcStart, pm.index + returnStatement[0].length);
      const hasFileSystemWrite = /writeFile|writeFileSync|mkdir|mkdirSync|writeSync|createWriteStream/.test(funcBody);
      if (!hasFileSystemWrite) return true;
    }

    return false;
  },
  fix: 'If you return success, you must have performed the work. If you return a path, you must have created it. Otherwise return `action_required` with exact instructions for the caller.',
};

// ═══════════════════════════════════════════════
// P12: EMPTY STATE GUARD
// ═══════════════════════════════════════════════

export const P12_EMPTY_STATE_GUARD: ViolationDetector = {
  id: 'P12',
  category: 'collection-safety',
  description: 'Empty State Guard — collection aggregations/comparisons without zero-length checks produce false success',
  severity: 'high',
  detect(code: string, _ctx: CodeContext): boolean {
    const setSizeRe = /new\s+Set\s*\([^)]*\)\s*\.size\s*(?:<=|>=|<|>|===|!==)\s*\d+/g;
    let m;
    while ((m = setSizeRe.exec(code)) !== null) {
      const region = code.substring(Math.max(0, m.index - 500), m.index + m[0].length + 200);
      const hasEmptyGuard = /\.length\s*(?:===|!==|>|<|>=|<=)\s*0|\blength\s*===?\s*0\b|\bisEmpty\b|\bisEmpty\b/.test(region);
      if (!hasEmptyGuard) return true;
    }

    const lengthCompareRe = /\.\s*length\s*(?:<=|>=)\s*[01]\b/g;
    while ((m = lengthCompareRe.exec(code)) !== null) {
      const region = code.substring(Math.max(0, m.index - 400), m.index + m[0].length + 200);
      const isConsensusContext = /consensus|verif|valid|agree|match|compar|all\s*(?:same|equal|match)/.test(region);
      if (isConsensusContext) {
        const hasExplicitLengthCheck = /\.length\s*===?\s*0|\.length\s*>\s*0|\.length\s*!==?\s*0/.test(region);
        const hasIfGuard = /if\s*\([^)]*\.length/.test(region);
        if (!hasExplicitLengthCheck && !hasIfGuard) return true;
      }
    }

    const everyRe = /\.\s*every\s*\(\s*(?:\([^)]*\)\s*=>|\w+\s*=>)/g;
    while ((m = everyRe.exec(code)) !== null) {
      const region = code.substring(Math.max(0, m.index - 400), m.index + m[0].length + 200);
      const isValidation = /valid|check|verify|consensus|pass|approve|accept/.test(region);
      if (isValidation) {
        const hasLengthGuard = /\.length\s*(?:>|!==?\s*0|===?\s*[2-9])/.test(region);
        const hasIfGuard = /if\s*\([^)]*\.length/.test(region);
        if (!hasLengthGuard && !hasIfGuard) return true;
      }
    }

    return false;
  },
  fix: 'Guard every collection operation: `if (items.length === 0) return { success: false, error: "Empty input" };` — `[].every(fn)` returns true, `new Set([]).size <= 1` is true — both are false success.',
};

// ═══════════════════════════════════════════════
// ENFORCEMENT RULES
// ═══════════════════════════════════════════════

export const RUNTIME_GRADE_ENFORCEMENT_RULES: EnforcementRule[] = [
  {
    detector: P1_DEFENSIVE_IMPORT,
    enforcementAction: 'flag',
    escalationTarget: 'execution',
    autoFixable: false,
  },
  {
    detector: P2_TYPE_CERTAINTY,
    enforcementAction: 'block',
    escalationTarget: 'system',
    autoFixable: false,
  },
  {
    detector: P3_ERROR_COMPLETENESS,
    enforcementAction: 'block',
    escalationTarget: 'system',
    autoFixable: false,
  },
  {
    detector: P4_RESOURCE_LIFECYCLE,
    enforcementAction: 'block',
    escalationTarget: 'system',
    autoFixable: false,
  },
  {
    detector: P5_ATOMIC_STATE,
    enforcementAction: 'block',
    escalationTarget: 'system',
    autoFixable: false,
  },
  {
    detector: P6_DEPENDENCY_VERIFICATION,
    enforcementAction: 'flag',
    escalationTarget: 'execution',
    autoFixable: false,
  },
  {
    detector: P7_PATH_RESOLUTION,
    enforcementAction: 'block',
    escalationTarget: 'system',
    autoFixable: true,
  },
  {
    detector: P8_CONFIG_VALIDATION,
    enforcementAction: 'block',
    escalationTarget: 'system',
    autoFixable: false,
  },
  {
    detector: P9_ASYNC_DISCIPLINE,
    enforcementAction: 'block',
    escalationTarget: 'system',
    autoFixable: false,
  },
  {
    detector: P10_OUTPUT_CONTRACT,
    enforcementAction: 'flag',
    escalationTarget: 'execution',
    autoFixable: false,
  },
  {
    detector: P11_OUTPUT_IS_THE_WORK,
    enforcementAction: 'block',
    escalationTarget: 'system',
    autoFixable: false,
  },
  {
    detector: P12_EMPTY_STATE_GUARD,
    enforcementAction: 'flag',
    escalationTarget: 'execution',
    autoFixable: false,
  },
];

// ═══════════════════════════════════════════════
// CHECKLIST FIELD MAPPING
// ═══════════════════════════════════════════════

export const CHECKLIST_FIELD_MAP: Readonly<Record<string, string[]>> = {
  importValidity: ['P1', 'P6'],
  nullSafetyHandled: ['P2'],
  errorPathsComplete: ['P3'],
  resourceCleanupAllPaths: ['P4'],
  concurrentSafety: ['P5'],
  pathResolution: ['P7'],
  configValidated: ['P8'],
  typeAssertionsGuarded: ['P2'],
  asyncDiscipline: ['P9'],
  returnTypeCorrect: ['P10'],
  crossSystemDataContractsValidated: ['P11'],
  coupledDataConsistencyVerified: ['P12'],
  gridDataIntegrityVerified: [],
};

// ═══════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════

const ALL_DETECTORS: Readonly<Record<string, ViolationDetector>> = {
  P1: P1_DEFENSIVE_IMPORT,
  P2: P2_TYPE_CERTAINTY,
  P3: P3_ERROR_COMPLETENESS,
  P4: P4_RESOURCE_LIFECYCLE,
  P5: P5_ATOMIC_STATE,
  P6: P6_DEPENDENCY_VERIFICATION,
  P7: P7_PATH_RESOLUTION,
  P8: P8_CONFIG_VALIDATION,
  P9: P9_ASYNC_DISCIPLINE,
  P10: P10_OUTPUT_CONTRACT,
  P11: P11_OUTPUT_IS_THE_WORK,
  P12: P12_EMPTY_STATE_GUARD,
};

export function evaluateCodeAgainstChecklist(
  code: string,
  context: CodeContext,
): Partial<EngineeringChecklistFields> {
  const results: Record<string, boolean> = {};
  for (const [id, detector] of Object.entries(ALL_DETECTORS)) {
    results[id] = !detector.detect(code, context);
  }

  const checklist: Partial<EngineeringChecklistFields> = {};
  for (const [field, detectorIds] of Object.entries(CHECKLIST_FIELD_MAP)) {
    if (detectorIds.length === 0) continue;
    (checklist as Record<string, boolean>)[field] = detectorIds.every(id => results[id] === true);
  }

  return checklist;
}

export function detectAllViolations(
  code: string,
  context: CodeContext,
): Array<{ detector: ViolationDetector; rule: EnforcementRule }> {
  const violations: Array<{ detector: ViolationDetector; rule: EnforcementRule }> = [];
  for (const rule of RUNTIME_GRADE_ENFORCEMENT_RULES) {
    if (rule.detector.detect(code, context)) {
      violations.push({ detector: rule.detector, rule });
    }
  }
  return violations;
}

export function getDetectorById(id: string): ViolationDetector | undefined {
  return ALL_DETECTORS[id];
}
