/**
 * src/eie/nodes/failure-patterns.ts — 20 Failure Mode Nodes (FM-01 through FM-20)
 *
 * T3 Common Sense section 18 — Common failure modes with symptoms, causes,
 * detection methods, and remediation.
 *
 * Source: T3_ALGORITHMIC_SYSTEMS.md section 18
 */

import type { KnowledgeNode } from '../types';

function fp(
  id: string, rule: string, detection: string, fix: string, bullet: string,
  severity: 'block' | 'warn' | 'guide', layer: 0 | 1 | 2 | 3 | 4 | 5, links: string[],
): KnowledgeNode {
  return {
    id, source: 'alg-sys' as const, sourceFile: 'T3_ALGORITHMIC_SYSTEMS.md',
    category: 'failure-pattern' as const,
    rule, detectionMethod: detection, fixTemplate: fix,
    conditions: [{ field: 'errorPattern', op: 'matches', value: id }],
    bulletTemplate: bullet,
    warheadTemplate: '# ' + id + '\n' + rule,
    evidenceSpec: { id: 'no-failure', verify: 'rge-audit', minQuality: 0.95 },
    severity, layer, links, selfVerified: true,
  };
}

export const FM01_LOAD_TIME_CRASH: KnowledgeNode = fp(
  'FM-01-LOAD-TIME-CRASH',
  'FM-01 LOAD-TIME CRASH: Module crashes at import time.\nSYMPTOM: x is not a function at top level.\nCAUSE: Imported symbol does not exist (P1 violation).\nREMEDIATION: Use namespace import + typeof guard before first call.',
  'AST: Find ImportDeclaration nodes. For each imported symbol, verify it exists in the target module.',
  'import * as mod from "./mod.js"; if (typeof mod.someFn !== "function") throw new Error("[FM01] missing export");',
  'FM-01: Load-time crash from missing export. Add namespace import + typeof guard.',
  'block', 1, ['P1-DEFENSIVE-IMPORT', 'IL01-OUTPUT-IS-REALITY', 'IL09-WIRE-DONT-DECLARE'],
);

export const FM02_SILENT_DATA_CORRUPTION: KnowledgeNode = fp(
  'FM-02-SILENT-DATA-CORRUPTION',
  'FM-02 SILENT DATA CORRUPTION: Data corrupted because errors are swallowed.\nSYMPTOM: Incorrect output with no error.\nCAUSE: Empty catch block (P3 violation) swallows the error.\nREMEDIATION: Every catch must log + recover or re-throw.',
  'AST: Find CatchClause nodes. Extract body. Strip comments. If empty or console-only, flag.',
  'catch (e: unknown) { const msg = e instanceof Error ? e.message : String(e); logger.error("[FM02]", { error: msg }); return { ok: false, error: msg }; }',
  'FM-02: Empty catch allows data corruption. Add log + recover or re-throw.',
  'block', 1, ['P3-ERROR-COMPLETENESS', 'IL04-NO-SILENT-FAILURE', 'AP-EMPTY-CATCH'],
);

export const FM03_RESOURCE_LEAK: KnowledgeNode = fp(
  'FM-03-RESOURCE-LEAK',
  'FM-03 RESOURCE LEAK: Resources acquired but never released.\nSYMPTOM: Memory growth, fd exhaustion, zombie timers.\nCAUSE: Resource acquired without cleanup in finally (P4 violation).\nREMEDIATION: Wrap in try/finally with cleanup.',
  'CFG: For each setInterval/openSync/addEventListener, check if cleanup exists in finally on all exit paths.',
  'const timer = setInterval(fn, ms); try { /* work */ } finally { clearInterval(timer); }',
  'FM-03: Resource leaked. Add try/finally with cleanup.',
  'block', 4, ['P4-RESOURCE-LIFECYCLE', 'IL06-RESOURCE-OWNERSHIP', 'AP-UNCLEANED-INTERVAL'],
);

export const FM04_TORN_STATE: KnowledgeNode = fp(
  'FM-04-TORN-STATE',
  'FM-04 TORN STATE: State partially updated when async fails between mutations.\nSYMPTOM: Loading indicator stuck, inconsistent state.\nCAUSE: Sequential mutations across await without try/finally (P5 violation).\nREMEDIATION: Use atomic spread or try/finally.',
  'CFG: Detect state.loading = true; await ...; state.loading = false without try/finally.',
  'try { const data = await fetch(); state = { ...state, loading: false, data, error: null }; } catch (e) { state = { ...state, loading: false, error: e }; }',
  'FM-04: Torn state — mutations across await without try/finally.',
  'block', 4, ['P5-ATOMIC-STATE', 'IL05-ATOMIC-TRANSITION', 'AP-TORN-STATE'],
);

export const FM05_UNHANDLED_REJECTION: KnowledgeNode = fp(
  'FM-05-UNHANDLED-REJECTION',
  'FM-05 UNHANDLED REJECTION: Promise rejects with no catch handler.\nSYMPTOM: Node exits with UnhandledPromiseRejection.\nCAUSE: then without catch (P9 violation).\nREMEDIATION: Every async call needs await+catch or catch handler.',
  'CFG: Find then chains without catch. Find async calls without await and without catch.',
  'try { const r = await fn(); } catch (e) { logger.error("[FM05]", e); }',
  'FM-05: Unhandled rejection — Promise without error handler.',
  'block', 4, ['P9-ASYNC-DISCIPLINE', 'IL03-ASYNC-COMPLETENESS', 'AP-FLOATING-PROMISE'],
);

export const FM06_TYPE_CONFUSION: KnowledgeNode = fp(
  'FM-06-TYPE-CONFUSION',
  'FM-06 TYPE CONFUSION: Runtime receives wrong type.\nSYMPTOM: Cannot read property of undefined.\nCAUSE: Unguarded as cast (P2 violation).\nREMEDIATION: Add runtime type guard before every cast.',
  'AST: Find TSAsExpression nodes. Scan preceding for typeof or instanceof guards.',
  'if (typeof val !== "object" || val === null) throw new TypeError("[FM06]"); const obj = val as MyType;',
  'FM-06: Type confusion — unguarded cast. Add typeof guard.',
  'block', 1, ['P2-TYPE-CERTAINTY', 'IL02-CONTRACT-HONORED', 'AP-UNSAFE-CAST'],
);

export const FM07_ENVIRONMENT_DEPENDENCY: KnowledgeNode = fp(
  'FM-07-ENV-DEPENDENCY',
  'FM-07 ENVIRONMENT DEPENDENCY: Code crashes on different machine.\nSYMPTOM: ENOENT or EACCES in production.\nCAUSE: Hardcoded path (P7 violation).\nREMEDIATION: Use path.join with __dirname.',
  'Regex scan for machine-specific paths.',
  'const dir = path.join(__dirname, "..", "data");',
  'FM-07: Hardcoded path. Replace with path.join(__dirname, ...).',
  'block', 2, ['P7-PATH-RESOLUTION', 'IL07-ENVIRONMENT-INDEPENDENCE', 'AP-HARDCODED-PATH'],
);

export const FM08_CONFIG_INJECTION: KnowledgeNode = fp(
  'FM-08-CONFIG-INJECTION',
  'FM-08 CONFIG INJECTION: Invalid config causes failure far from loader.\nSYMPTOM: parseInt(undefined) produces NaN.\nCAUSE: Config used without validation (P8 violation).\nREMEDIATION: Validate type, range, presence at load time.',
  'AST: Find process.env accesses without nearby validation.',
  'const port = parseInt(process.env.PORT ?? "", 10); if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("[FM08]");',
  'FM-08: Config used without validation. Add type+range+presence check.',
  'block', 2, ['P8-CONFIG-VALIDATION', 'IL08-FAIL-FAST-CONFIG', 'AP-UNVALIDATED-CONFIG'],
);

export const FM09_THEATRICAL_COMPLETION: KnowledgeNode = fp(
  'FM-09-THEATRICAL-COMPLETION',
  'FM-09 THEATRICAL COMPLETION: Function claims work without side effects.\nSYMPTOM: Returns done true but filesystem unchanged.\nCAUSE: Theatrical code (P11 violation, IL18 violation).\nREMEDIATION: Perform real work or return action_required.',
  'AST: Find return statements with completion flags. Trace back for side effects.',
  'fs.writeFileSync(path, data); return { done: true, path };',
  'FM-09: Theatrical completion. Function must DO work, not claim it.',
  'block', 4, ['P11-OUTPUT-IS-THE-WORK', 'IL18-THEATRICAL-CODE-ZERO', 'AP-THEATRICAL-CODE'],
);

export const FM10_VACUOUS_VALIDATION: KnowledgeNode = fp(
  'FM-10-VACUOUS-VALIDATION',
  'FM-10 VACUOUS VALIDATION: Empty collection operations produce false positives.\nSYMPTOM: Validation appears to succeed but nothing was validated.\nCAUSE: every on empty array returns true (P12 violation).\nREMEDIATION: Guard with length zero check.',
  'AST: Find every calls in validation contexts without preceding length guard.',
  'if (items.length === 0) return { valid: false, error: "empty" }; const allValid = items.every(isValid);',
  'FM-10: Vacuous validation — every on empty array.',
  'warn', 2, ['P12-EMPTY-STATE-GUARD', 'IL12-EMPTY-IS-NOT-SUCCESS', 'AP-EMPTY-STATE-FALSE-POSITIVE'],
);

export const FM11_EVIDENCE_FABRICATION: KnowledgeNode = fp(
  'FM-11-EVIDENCE-FABRICATION',
  'FM-11 EVIDENCE FABRICATION: Agent claims evidence exists but it does not.\nSYMPTOM: Gate claims verified but no evidence files exist.\nCAUSE: Evidence created in memory only (IL10 violation).\nREMEDIATION: Produce evidence mechanically on filesystem.',
  'Compare registered evidence IDs against filesystem state.',
  'Execute mechanical check (tsc, build, test). Store result on disk.',
  'FM-11: Evidence fabricated — claimed but not on filesystem.',
  'block', 5, ['IL10-EVIDENCE-IS-MECHANICAL', 'IL11-OUTPUT-IS-PROOF', 'AP-EVIDENCE-FABRICATION'],
);

export const FM12_DEAD_CODE: KnowledgeNode = fp(
  'FM-12-DEAD-CODE',
  'FM-12 DEAD CODE: Exported functions never imported or called.\nSYMPTOM: Bundle grows without functionality.\nCAUSE: Function declared and exported but never wired (IL09 violation).\nREMEDIATION: Wire it or delete it.',
  'Build import graph: collect all imported symbols. Compare against all exported symbols.',
  'Either: import { unusedFn } from "./mod.js"; unusedFn(); OR: delete the export.',
  'FM-12: Dead export. Wire it or delete it.',
  'warn', 2, ['IL09-WIRE-DONT-DECLARE', 'AP-DEAD-EXPORT'],
);

export const FM13_SCOPE_CREEP: KnowledgeNode = fp(
  'FM-13-SCOPE-CREEP',
  'FM-13 SCOPE CREEP: Agent modifies files outside task scope.\nSYMPTOM: Unrelated files modified.\nCAUSE: Derailment signals 1-2 (IL16 violation).\nREMEDIATION: Stop, revert, re-state task.',
  'Track modified files. Compare against SPEC.md manifest.',
  'On detection: stop, revert to checkpoint, re-state task, resume.',
  'FM-13: Scope creep — modifying files outside task scope.',
  'block', 5, ['IL16-DERAILMENT-FIVE-SIGNALS', 'AP-SCOPE-CREEP'],
);

export const FM14_FAKE_TEST: KnowledgeNode = fp(
  'FM-14-FAKE-TEST',
  'FM-14 FAKE TEST: Test asserts hardcoded literals instead of behavior.\nSYMPTOM: Verification suite green but bugs slip through.\nCAUSE: expect(literal) not expect(fn(input)).\nREMEDIATION: Call function with input, assert on output.',
  'AST: Find expect calls with literal arguments not referencing the test subject.',
  'const result = myFunction(realInput); expect(result).toBe(expectedOutput);',
  'FM-14: Fake test — expect uses literal. Rewrite to verify behavior.',
  'block', 4, ['AP-FAKE-TEST', 'IL18-THEATRICAL-CODE-ZERO'],
);

export const FM15_CONCURRENT_MODIFICATION: KnowledgeNode = fp(
  'FM-15-CONCURRENT-MOD',
  'FM-15 CONCURRENT MODIFICATION: Shared state modified concurrently without sync.\nSYMPTOM: Intermittent corruption, race conditions.\nCAUSE: Multiple async ops read/write same state.\nREMEDIATION: Use Actor model or mutex.',
  'CFG: Find shared mutable state accessed from multiple async contexts.',
  'Use Actor model: each actor owns its state. Messages are immutable.',
  'FM-15: Concurrent modification. Use Actor model.',
  'warn', 4, ['CONC-ACTOR-MODEL', 'CONC-MESSAGE-PASSING', 'P5-ATOMIC-STATE'],
);

export const FM16_CONFIGURATION_DRIFT: KnowledgeNode = fp(
  'FM-16-CONFIG-DRIFT',
  'FM-16 CONFIGURATION DRIFT: Runtime config differs from declared config.\nSYMPTOM: Works locally, fails in CI.\nCAUSE: Config changed in one place but not everywhere.\nREMEDIATION: Single source of truth, validate at startup.',
  'Compare tsconfig.json against runtime program options.',
  'Validate config at startup: if (config.target !== tsconfig.target) throw.',
  'FM-16: Config drift — key differs between declared and runtime.',
  'warn', 2, ['P8-CONFIG-VALIDATION', 'IL08-FAIL-FAST-CONFIG'],
);

export const FM17_INFINITE_LOOP: KnowledgeNode = fp(
  'FM-17-INFINITE-LOOP',
  'FM-17 INFINITE LOOP: Loop with no termination condition.\nSYMPTOM: Process hangs, CPU 100 percent, memory grows.\nCAUSE: Loop variable never changes or base case unreachable.\nREMEDIATION: Add termination condition and max iterations.',
  'CFG: For each loop, verify condition variable is modified in body.',
  'let maxIter = 1000; while (condition && maxIter-- > 0) { /* work */ }',
  'FM-17: Possible infinite loop. Verify condition changes in body.',
  'warn', 4, ['ERR-RT-MAX-CALL-STACK', 'P4-RESOURCE-LIFECYCLE'],
);

export const FM18_ZOMBIE_TIMER: KnowledgeNode = fp(
  'FM-18-ZOMBIE-TIMER',
  'FM-18 ZOMBIE TIMER: setInterval continues after function returned.\nSYMPTOM: Memory leak, callbacks on invalid state.\nCAUSE: setInterval without clearInterval in finally.\nREMEDIATION: Store timer ID, clear in finally.',
  'CFG: For each setInterval, check all exit paths for clearInterval in finally.',
  'const id = setInterval(fn, ms); try { /* work */ } finally { clearInterval(id); }',
  'FM-18: Zombie timer — setInterval without clearInterval in finally.',
  'block', 4, ['P4-RESOURCE-LIFECYCLE', 'IL06-RESOURCE-OWNERSHIP', 'AP-UNCLEANED-INTERVAL'],
);

export const FM19_NULL_DEREFERENCE: KnowledgeNode = fp(
  'FM-19-NULL-DEREF',
  'FM-19 NULL DEREFERENCE: Accessing property on null or undefined.\nSYMPTOM: Cannot read properties of null.\nCAUSE: Variable is null/undefined accessed without guard.\nREMEDIATION: Use optional chaining or null check.',
  'AST+TypeChecker: Find PropertyAccessExpression chains where any intermediate is nullable.',
  'const value = obj?.property?.subProperty ?? defaultValue;',
  'FM-19: Null dereference. Use optional chaining or null check.',
  'block', 1, ['P2-TYPE-CERTAINTY', 'IL02-CONTRACT-HONORED', 'ERR-TS2531'],
);

export const FM20_PROMISE_SERIAL: KnowledgeNode = fp(
  'FM-20-PROMISE-SERIAL',
  'FM-20 PROMISE SERIAL: Sequential awaits for independent operations.\nSYMPTOM: Performance degradation, slower than needed.\nCAUSE: await for independent ops instead of Promise.all.\nREMEDIATION: Use Promise.all for independent operations.',
  'CFG: Find sequential awaits. Check if operations have data dependency.',
  'const [a, b] = await Promise.all([fetchA(), fetchB()]);',
  'FM-20: Sequential awaits for independent ops. Use Promise.all.',
  'guide', 4, ['P9-ASYNC-DISCIPLINE', 'CONC-PROMISE-ALL'],
);

export const failurePatterns: KnowledgeNode[] = [
  FM01_LOAD_TIME_CRASH, FM02_SILENT_DATA_CORRUPTION, FM03_RESOURCE_LEAK,
  FM04_TORN_STATE, FM05_UNHANDLED_REJECTION, FM06_TYPE_CONFUSION,
  FM07_ENVIRONMENT_DEPENDENCY, FM08_CONFIG_INJECTION, FM09_THEATRICAL_COMPLETION,
  FM10_VACUOUS_VALIDATION, FM11_EVIDENCE_FABRICATION, FM12_DEAD_CODE,
  FM13_SCOPE_CREEP, FM14_FAKE_TEST, FM15_CONCURRENT_MODIFICATION,
  FM16_CONFIGURATION_DRIFT, FM17_INFINITE_LOOP, FM18_ZOMBIE_TIMER,
  FM19_NULL_DEREFERENCE, FM20_PROMISE_SERIAL,
];
