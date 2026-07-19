/**
 * src/eie/nodes/build-order-nodes.ts — 10 Build Order Nodes (BO-01 through BO-10)
 *
 * Failure-mode-first build sequences. Each node encodes the principle that
 * the safe/error/edge-case/boundary/contract scaffolding must be built
 * BEFORE the happy-path feature logic, and that deployment is always last.
 *
 * The ordering is the safety: building the trap-door before walking the
 * plank. Reverse the order and the failure modes (FM-01..FM-20) become
 * reachable.
 *
 * Source: T3_ALGORITHMIC_SYSTEMS.md (failure-mode-first build discipline)
 */

import type { KnowledgeNode } from '../types';

/**
 * bo() — build-order node builder. Positional, deterministic, mirrors the
 * fp() pattern used by failure-patterns.ts. Fixes source/category/severity/
 * layer so every node in this module shares the build-order contract.
 */
function bo(
  id: string, rule: string, detection: string, fix: string, bullet: string,
  links: string[],
): KnowledgeNode {
  return {
    id,
    source: 'alg-sys' as const,
    sourceFile: 'T3_ALGORITHMIC_SYSTEMS.md',
    category: 'build-order' as const,
    rule,
    detectionMethod: detection,
    fixTemplate: fix,
    conditions: [{ field: 'codeConstruct', op: 'matches', value: id }],
    bulletTemplate: bullet,
    warheadTemplate: '# ' + id + '\n' + rule,
    evidenceSpec: { id: 'build-order-honored', verify: 'rge-audit', minQuality: 0.95 },
    severity: 'block' as const,
    layer: 5,
    links,
    selfVerified: true,
  };
}

// ── BO-01: Types First ──────────────────────────────────────────
export const BO01_TYPES_FIRST: KnowledgeNode = bo(
  'BO-01-TYPES-FIRST',
  'BO-01 TYPES-FIRST: Define types and interfaces BEFORE writing implementation logic.\n'
  + 'SYMPTOM: Implementation references shapes that drift; later refactors break silently.\n'
  + 'CAUSE: Logic written against ad-hoc object literals with no declared contract.\n'
  + 'REMEDIATION: Declare the type/interface for every input, output, and shared structure first; '
  + 'the compiler then enforces the contract while the body is written.',
  'AST: Collect Identifier references in a function body. For each, check the referenced type/interface '
  + 'is declared lexically above (or imported). Flag bodies that consume un-typed object property access.',
  'type Order = { id: string; total: number; items: OrderItem[] };\n'
  + 'function sum(o: Order): number { return o.items.reduce((a, i) => a + i.price, 0); }',
  'BO-01: Types before logic. Declare the contract, then write the body against it.',
  ['P2-TYPE-CERTAINTY', 'IL02-CONTRACT-HONORED', 'BO-08-CONTRACT-BEFORE-IMPL'],
);

// ── BO-02: Error Handling First ─────────────────────────────────
export const BO02_ERROR_HANDLING_FIRST: KnowledgeNode = bo(
  'BO-02-ERROR-HANDLING-FIRST',
  'BO-02 ERROR-HANDLING-FIRST: Wrap dangerous operations in try-catch BEFORE writing feature logic.\n'
  + 'SYMPTOM: Unhandled rejections, swallowed errors, partial state on failure.\n'
  + 'CAUSE: Happy path written first; error handling bolted on later (or never).\n'
  + 'REMEDIATION: Erect the try-catch scaffold first, then fill the try body with feature code; '
  + 'the catch must log + recover or re-throw.',
  'CFG: Find await / IO / network calls. For each, verify a surrounding try-catch exists on the same '
  + 'or enclosing scope before any feature statement.',
  'try {\n'
  + '  const data = await fetch(url);\n'
  + '  /* feature logic here */\n'
  + '} catch (e: unknown) {\n'
  + '  const msg = e instanceof Error ? e.message : String(e);\n'
  + '  logger.error("[BO02]", { error: msg });\n'
  + '  return { ok: false, error: msg };\n'
  + '}',
  'BO-02: Error handling before features. Build the catch scaffold, then fill the try.',
  ['P3-ERROR-COMPLETENESS', 'IL04-NO-SILENT-FAILURE', 'FM02-SILENT-DATA-CORRUPTION', 'FM05-UNHANDLED-REJECTION'],
);

// ── BO-03: Resources First ──────────────────────────────────────
export const BO03_RESOURCES_FIRST: KnowledgeNode = bo(
  'BO-03-RESOURCES-FIRST',
  'BO-03 RESOURCES-FIRST: Create the finally cleanup BEFORE using the resource.\n'
  + 'SYMPTOM: Memory growth, fd exhaustion, zombie timers after early return or throw.\n'
  + 'CAUSE: Resource acquired (open/interval/connect) with no finally defined before usage.\n'
  + 'REMEDIATION: Acquire the resource, immediately write the try/finally that releases it, '
  + 'THEN write the work inside the try.',
  'CFG: For each acquire node (openSync, setInterval, createConnection, addEventListener), verify a '
  + 'finally block releasing it is present on ALL exit paths before any use statement.',
  'const fd = fs.openSync(p, "r");\n'
  + 'try {\n'
  + '  /* work that uses fd */\n'
  + '} finally {\n'
  + '  fs.closeSync(fd);\n'
  + '}',
  'BO-03: Resources before usage. Acquire, then write the finally, then do the work.',
  ['P4-RESOURCE-LIFECYCLE', 'IL06-RESOURCE-OWNERSHIP', 'FM03-RESOURCE-LEAK', 'FM18-ZOMBIE-TIMER'],
);

// ── BO-04: Empty State First ────────────────────────────────────
export const BO04_EMPTY_STATE_FIRST: KnowledgeNode = bo(
  'BO-04-EMPTY-STATE-FIRST',
  'BO-04 EMPTY-STATE-FIRST: Handle empty / null / undefined BEFORE the happy path.\n'
  + 'SYMPTOM: every() on [] returns true; .map on undefined throws; silent false-positives.\n'
  + 'CAUSE: Happy path assumes non-empty; empty case falls through unvalidated.\n'
  + 'REMEDIATION: At every boundary, branch on emptiness first and return a defined result; '
  + 'only then process the populated case.',
  'AST: Find collection operations (.map/.filter/.every/.reduce) and property access on parameters. '
  + 'Verify a length/null guard precedes them on all paths.',
  'if (!items || items.length === 0) return { valid: false, error: "empty" };\n'
  + 'const allValid = items.every(isValid);',
  'BO-04: Empty state before happy path. Branch on empty/null/undefined first.',
  ['P12-EMPTY-STATE-GUARD', 'IL12-EMPTY-IS-NOT-SUCCESS', 'FM10-VACUOUS-VALIDATION', 'BO-06-BOUNDARY-VALIDATION'],
);

// ── BO-05: Negative Path First ──────────────────────────────────
export const BO05_NEGATIVE_PATH_FIRST: KnowledgeNode = bo(
  'BO-05-NEGATIVE-PATH-FIRST',
  'BO-05 NEGATIVE-PATH-FIRST: Handle wrong inputs BEFORE right ones. Ask "what breaks this?" first.\n'
  + 'SYMPTOM: Inputs of the wrong type/shape/range crash deep in the call stack.\n'
  + 'CAUSE: Only the positive branch was designed; adversarial inputs reach core logic.\n'
  + 'REMEDIATION: Enumerate failure inputs first; write the reject/error branch for each; '
  + 'then write the accept branch.',
  'CFG: For each input parameter, verify an early-return/throw guard for the invalid case exists before '
  + 'the accept branch. Flag functions whose first branch is the happy path.',
  'function parsePort(raw: string): number {\n'
  + '  if (!/^[0-9]+$/.test(raw)) throw new TypeError("[BO05] not a number");\n'
  + '  const n = parseInt(raw, 10);\n'
  + '  if (n < 1 || n > 65535) throw new RangeError("[BO05] out of range");\n'
  + '  return n; /* accept branch last */\n'
  + '}',
  'BO-05: Negative path before positive. Design the reject branch first, accept last.',
  ['IL02-CONTRACT-HONORED', 'FM06-TYPE-CONFUSION', 'BO-06-BOUNDARY-VALIDATION', 'TEST_NEGATIVE_INPUT'],
);

// ── BO-06: Boundary Validation ──────────────────────────────────
export const BO06_BOUNDARY_VALIDATION: KnowledgeNode = bo(
  'BO-06-BOUNDARY-VALIDATION',
  'BO-06 BOUNDARY-VALIDATION: Validate at every boundary (function entry, API entry, IPC) BEFORE processing.\n'
  + 'SYMPTOM: Bad data propagates from the edge into the core; errors surface far from origin.\n'
  + 'CAUSE: Trust assumed at the boundary; validation deferred to "later" (never).\n'
  + 'REMEDIATION: Treat each function/endpoint/process boundary as untrusted; validate type, range, '
  + 'presence as the FIRST statements and fail fast.',
  'CFG: Find function-entry and handler-entry nodes. Verify the first N statements are guards '
  + '(throw/return on invalid). Flag entries that perform work before any guard.',
  'export function handler(req: Request): Response {\n'
  + '  const body = req.body;\n'
  + '  if (typeof body?.email !== "string" || !body.email.includes("@")) {\n'
  + '    return new Response("bad email", { status: 400 });\n'
  + '  }\n'
  + '  /* process trusted input */\n'
  + '}',
  'BO-06: Validate at boundaries first. Every entry point is untrusted until checked.',
  ['P8-CONFIG-VALIDATION', 'IL08-FAIL-FAST-CONFIG', 'FM08-CONFIG-INJECTION', 'SEC_SANDBOX_ISOLATION'],
);

// ── BO-07: Config Before Code ───────────────────────────────────
export const BO07_CONFIG_BEFORE_CODE: KnowledgeNode = bo(
  'BO-07-CONFIG-BEFORE-CODE',
  'BO-07 CONFIG-BEFORE-CODE: Configuration files BEFORE source code. tsconfig before src/.\n'
  + 'SYMPTOM: Build succeeds with wrong target; runtime diverges from declared config.\n'
  + 'CAUSE: Source written before toolchain config; config patched to match code rather than leading it.\n'
  + 'REMEDIATION: Establish tsconfig.json / package.json / build config first; validate them; '
  + 'then write source that conforms to the declared contract.',
  'FS-MANIFEST: Verify tsconfig.json, package.json, and build config exist and parse before any src/*.ts '
  + 'file. Compare declared compilerOptions against runtime program options for drift.',
  '/* tsconfig.json first — strict, target, moduleResolution declared */\n'
  + '/* package.json second — entry, scripts, deps declared */\n'
  + '/* src/ last — conforms to the above */',
  'BO-07: Config before code. tsconfig and package.json lead; source follows.',
  ['P8-CONFIG-VALIDATION', 'IL08-FAIL-FAST-CONFIG', 'FM16-CONFIGURATION-DRIFT', 'BO-07-CONFIG-BEFORE-CODE'],
);

// ── BO-08: Contract Before Impl ─────────────────────────────────
export const BO08_CONTRACT_BEFORE_IMPL: KnowledgeNode = bo(
  'BO-08-CONTRACT-BEFORE-IMPL',
  'BO-08 CONTRACT-BEFORE-IMPL: Define the interface/API contract BEFORE the implementation.\n'
  + 'SYMPTOM: Implementations drift from caller expectations; mock and prod disagree.\n'
  + 'CAUSE: Implementation written first; interface reverse-engineered from the body.\n'
  + 'REMEDIATION: Write the interface (method signatures, return types, error modes) first; '
  + 'stabilize it; then build implementations against it and mock against the same contract.',
  'AST: For each exported implementation (class/function), verify a corresponding interface or type alias '
  + 'is declared and the implementation is annotated to satisfy it. Flag exports with no declared contract.',
  'interface UserRepository {\n'
  + '  findById(id: string): Promise<User | null>;\n'
  + '}\n'
  + '/* contract stabilized — now implement */\n'
  + 'class SqlUserRepository implements UserRepository { /* ... */ }',
  'BO-08: Contract before implementation. Define the API, then build to it.',
  ['IL02-CONTRACT-HONORED', 'IL09-WIRE-DONT-DECLARE', 'BO-01-TYPES-FIRST', 'P10-OUTPUT-CONTRACT'],
);

// ── BO-09: Test Shaping ─────────────────────────────────────────
export const BO09_TEST_SHAPING: KnowledgeNode = bo(
  'BO-09-TEST-SHAPING',
  'BO-09 TEST-SHAPING: Write test-shaped code (pure, injectable, single-responsibility) from the start.\n'
  + 'SYMPTOM: Untestable monoliths; tests require heavy mocks or are skipped.\n'
  + 'CAUSE: Side effects and logic intermingled; dependencies hardcoded instead of injected.\n'
  + 'REMEDIATION: Shape each unit for testability up front: separate pure logic from IO, inject '
  + 'dependencies, keep functions single-responsibility so a test is trivial to write.',
  'CFG+AST: Find functions that interleave IO (fs/net/process) with pure transforms, or that construct '
  + 'dependencies internally rather than accepting them as parameters. Flag as not test-shaped.',
  '/* pure, injected, single-responsibility */\n'
  + 'function computeTotal(items: Item[], taxRate: number): number {\n'
  + '  const sub = items.reduce((a, i) => a + i.price, 0);\n'
  + '  return sub + sub * taxRate;\n'
  + '}\n'
  + '/* IO lives in the caller, not the unit */',
  'BO-09: Test-shaped code from the start. Pure, injected, single-responsibility units.',
  ['FM14-FAKE-TEST', 'IL10-EVIDENCE-IS-MECHANICAL', 'TEST_PROPERTY_BASED', 'TEST_TEST_ISOLATION'],
);

// ── BO-10: Deployment Last ──────────────────────────────────────
export const BO10_DEPLOYMENT_LAST: KnowledgeNode = bo(
  'BO-10-DEPLOYMENT-LAST',
  'BO-10 DEPLOYMENT-LAST: Deployment/delivery is the LAST step, never the first.\n'
  + 'SYMPTOM: Broken builds shipped; gates skipped; rollback required.\n'
  + 'CAUSE: Delivery scripted before build/verify/test gates pass.\n'
  + 'REMEDIATION: Sequence the gate chain PLAN->BUILD->TEST->VERIFY->AUDIT->DELIVERY; '
  + 'delivery may only run after every upstream gate is green and evidence is on disk.',
  'GATE-CHAIN: Verify the DELIVERY gate is the terminal gate and depends on AUDIT passing. Flag delivery '
  + 'scripts/configs that run before build artifacts or test evidence exist on the filesystem.',
  '/* gate order is immutable: PLAN -> BUILD -> TEST -> VERIFY -> AUDIT -> DELIVERY */\n'
  + 'if (!auditGate.passed || !evidenceOnDisk) throw new Error("[BO10] cannot deliver");\n'
  + '/* only now: ship */',
  'BO-10: Deployment is last. No delivery until every upstream gate is green.',
  ['IL19-GATE-ORDER-IMMUTABLE', 'FM11-EVIDENCE-FABRICATION', 'GK_DELIVERY_EVIDENCE_ARCHIVE', 'BO-07-CONFIG-BEFORE-CODE'],
);

// ── Aggregate ───────────────────────────────────────────────────
export const buildOrderNodes: KnowledgeNode[] = [
  BO01_TYPES_FIRST,
  BO02_ERROR_HANDLING_FIRST,
  BO03_RESOURCES_FIRST,
  BO04_EMPTY_STATE_FIRST,
  BO05_NEGATIVE_PATH_FIRST,
  BO06_BOUNDARY_VALIDATION,
  BO07_CONFIG_BEFORE_CODE,
  BO08_CONTRACT_BEFORE_IMPL,
  BO09_TEST_SHAPING,
  BO10_DEPLOYMENT_LAST,
];
