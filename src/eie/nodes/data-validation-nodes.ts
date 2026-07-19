/**
 * src/eie/nodes/data-validation-nodes.ts — 35 Data Validation Knowledge Nodes
 *
 * From KB-02:
 * - Schema-first validation philosophy
 * - Runtime guards (input, output, boundary, config, env, unknown, JSON)
 * - Exact, branded, nominal, template-literal, discriminated-union, Result/Optional types
 * - Async validation (parse, fetch, DB, timeout, retry)
 * - Complex structure validation (nested, array, Map, union, intersection)
 * - Security validation (SQL injection, XSS, command injection, path traversal, prototype pollution)
 * - Integrity validation (immutability, numeric range, secret redaction, circular refs, coercion)
 *
 * Source: KB-02_DATA_VALIDATION_DEEP.md
 */

import type { KnowledgeNode } from '../types';

// ══ SCHEMA-FIRST (1 node) ═══════════════════════════════════════

export const VALID_SCHEMA_FIRST: KnowledgeNode = {
  id: 'VALID-SCHEMA-FIRST',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'SCHEMA-FIRST VALIDATION: Define the data schema (types + runtime guards) before any code that accepts or processes that data. The schema is the single source of truth for shape.',
  detectionMethod: 'Find functions/handlers that accept external data (args, body, env) without a preceding schema or validator definition. Flag — data consumed before schema declared.',
  fixTemplate: 'const UserSchema = z.object({ id: z.string().uuid(), email: z.string().email() }); type User = z.infer<typeof UserSchema>; function process(u: User) { /* schema-first */ }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY'] }],
  bulletTemplate: 'VALID-SCHEMA-FIRST: Data accepted at {line} without a schema. Define schema before consumption.',
  warheadTemplate: 'A schema declared before consumption makes invalid states unrepresentable. Validate-first eliminates entire classes of runtime corruption.',
  evidenceSpec: { id: 'schema-first', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 1,
  links: ['VALID-RUNTIME-GUARD-INPUT', 'VALID-RUNTIME-GUARD-BOUNDARY', 'VALID-COMPLEX-NESTED', 'P2-TYPE-CERTAINTY'],
  selfVerified: true,
};

// ══ RUNTIME GUARDS (7 nodes) ════════════════════════════════════

export const VALID_RUNTIME_GUARD_INPUT: KnowledgeNode = {
  id: 'VALID-RUNTIME-GUARD-INPUT',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'RUNTIME GUARD — INPUT: Validate every function input at the entry point. Type annotations are compile-time only; runtime values must be narrowed before use.',
  detectionMethod: 'CFG: Find function entry nodes where parameters typed as non-primitive or `unknown`/`any` are used without a preceding guard/narrowing. Flag.',
  fixTemplate: 'function load(cfg: unknown) { if (typeof cfg !== "object" || cfg === null) throw new TypeError("cfg"); const c = cfg as { url: string }; if (typeof c.url !== "string") throw new TypeError("url"); }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY', 'AUDIT'] }],
  bulletTemplate: 'VALID-RUNTIME-GUARD-INPUT: Parameter at {line} used without entry validation. Add runtime guard.',
  warheadTemplate: 'Compile-time types are erased at runtime. Unvalidated inputs propagate invalid data deep into call chains where errors are hard to trace.',
  evidenceSpec: { id: 'rt-guard-input', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 1,
  links: ['VALID-SCHEMA-FIRST', 'VALID-RUNTIME-GUARD-OUTPUT', 'VALID-RUNTIME-GUARD-UNKNOWN', 'P1-DEFENSIVE-IMPORT'],
  selfVerified: true,
};

export const VALID_RUNTIME_GUARD_OUTPUT: KnowledgeNode = {
  id: 'VALID-RUNTIME-GUARD-OUTPUT',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'RUNTIME GUARD — OUTPUT: Validate function outputs before returning. Internal errors must not escape as malformed data; the return value must satisfy its declared contract.',
  detectionMethod: 'CFG: Find return statements returning computed/untrusted values (parsed, dynamic, external) without a final guard. Flag.',
  fixTemplate: 'function build(): Result<Config, Error> { const cfg = assemble(); if (!isConfig(cfg)) return { ok: false, error: new Error("bad cfg") }; return { ok: true, value: cfg }; }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY'] }],
  bulletTemplate: 'VALID-RUNTIME-GUARD-OUTPUT: Return at {line} not validated against contract. Add output guard.',
  warheadTemplate: 'An output guard ensures callers receive only contract-conforming data. Without it, downstream consumers inherit the internal bug as their input bug.',
  evidenceSpec: { id: 'rt-guard-output', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 2,
  links: ['VALID-RUNTIME-GUARD-INPUT', 'VALID-TYPES-RESULT', 'P10-OUTPUT-CONTRACT'],
  selfVerified: true,
};

export const VALID_RUNTIME_GUARD_BOUNDARY: KnowledgeNode = {
  id: 'VALID-RUNTIME-GUARD-BOUNDARY',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'RUNTIME GUARD — BOUNDARY: Validate at every trust boundary (API ingress/egress, IPC, file read, DB row). Data crossing a boundary is untrusted until proven otherwise.',
  detectionMethod: 'CFG: Find API handlers, IPC listeners, fs.readFile callbacks, and DB query consumers that use the result without validation. Flag.',
  fixTemplate: 'app.post("/u", (req, res) => { const parsed = UserSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json(parsed.error); return; } handle(parsed.data); });',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY', 'AUDIT'] }],
  bulletTemplate: 'VALID-RUNTIME-GUARD-BOUNDARY: Trust boundary at {line} crossed without validation. Add boundary guard.',
  warheadTemplate: 'Every boundary is an attack and corruption surface. Validating exactly at the boundary localizes validation and protects all interior code.',
  evidenceSpec: { id: 'rt-guard-boundary', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 1,
  links: ['VALID-SCHEMA-FIRST', 'VALID-RUNTIME-GUARD-INPUT', 'VALID-ASYNC-FETCH', 'VALID-ASYNC-DB', 'SEC-SANDBOX-ISOLATION'],
  selfVerified: true,
};

export const VALID_RUNTIME_GUARD_CONFIG: KnowledgeNode = {
  id: 'VALID-RUNTIME-GUARD-CONFIG',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'RUNTIME GUARD — CONFIG: Validate config objects at startup. Every required key, type, and range must be checked; fail fast on any invalid config before the service accepts work.',
  detectionMethod: 'CFG: Find config-loading code that spreads/uses config without a validation pass. Also flag configs typed as `any`. Flag.',
  fixTemplate: 'const raw = JSON.parse(readFileSync("config.json", "utf8")); const cfg = ConfigSchema.parse(raw); // throws on invalid — fail fast',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY'] }],
  bulletTemplate: 'VALID-RUNTIME-GUARD-CONFIG: Config used at {line} without validation. Validate at startup, fail fast.',
  warheadTemplate: 'Unvalidated config is silent data corruption that surfaces as wrong behavior deep in production. Validate once at boot and reject early.',
  evidenceSpec: { id: 'rt-guard-config', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 1,
  links: ['VALID-RUNTIME-GUARD-ENV', 'IL08-FAIL-FAST-CONFIG', 'P8-CONFIG-VALIDATION', 'AP-UNVALIDATED-CONFIG'],
  selfVerified: true,
};

export const VALID_RUNTIME_GUARD_ENV: KnowledgeNode = {
  id: 'VALID-RUNTIME-GUARD-ENV',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'RUNTIME GUARD — ENV: Validate environment variables with explicit types and presence checks. process.env values are always string|undefined; parse to numbers/enums/booleans explicitly.',
  detectionMethod: 'CFG: Find `process.env.X` reads that are used arithmetically or as non-strings without `Number()`/parse/guard. Also flag optional chaining on env without default. Flag.',
  fixTemplate: 'const PORT = Number(process.env.PORT); if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error("PORT invalid");',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY'] }],
  bulletTemplate: 'VALID-RUNTIME-GUARD-ENV: Env var at {line} used as typed value without parse/guard. Coerce and validate.',
  warheadTemplate: 'Env vars are opaque strings. Using them as numbers yields NaN; as booleans yields always-truthy. Explicit parsing with range checks is mandatory.',
  evidenceSpec: { id: 'rt-guard-env', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 1,
  links: ['VALID-RUNTIME-GUARD-CONFIG', 'IL07-ENVIRONMENT-INDEPENDENCE', 'IL08-FAIL-FAST-CONFIG', 'AP-ENV-VAR-BYPASS'],
  selfVerified: true,
};

export const VALID_RUNTIME_GUARD_UNKNOWN: KnowledgeNode = {
  id: 'VALID-RUNTIME-GUARD-UNKNOWN',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'RUNTIME GUARD — UNKNOWN: Treat `unknown` as untrusted. Narrow with type guards (typeof, instanceof, user-defined predicates) before any property access.',
  detectionMethod: 'AST: Find `unknown`-typed values accessed via member access (`.x`) or used without narrowing. Flag.',
  fixTemplate: 'function isUser(v: unknown): v is User { return typeof v === "object" && v !== null && typeof (v as User).id === "string"; } if (isUser(data)) { data.id; }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY', 'AUDIT'] }],
  bulletTemplate: 'VALID-RUNTIME-GUARD-UNKNOWN: `unknown` at {line} accessed without narrowing. Add type guard.',
  warheadTemplate: '`unknown` forces explicit narrowing. Accessing it directly bypasses this safety; the compiler should make unguarded access impossible.',
  evidenceSpec: { id: 'rt-guard-unknown', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 2,
  links: ['TS-SF-NO-ANY', 'VALID-RUNTIME-GUARD-INPUT', 'VALID-TYPES-DISCRIMINATED-UNION', 'P2-TYPE-CERTAINTY'],
  selfVerified: true,
};

export const VALID_RUNTIME_GUARD_JSON: KnowledgeNode = {
  id: 'VALID-RUNTIME-GUARD-JSON',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'RUNTIME GUARD — JSON: Never trust JSON.parse output shape. Validate the parsed structure against a schema before use; JSON.parse can return any valid JSON value.',
  detectionMethod: 'CFG: Find `JSON.parse(...)` whose result is cast/assigned to a specific type without a validation guard. Flag.',
  fixTemplate: 'const raw = JSON.parse(text) as unknown; const result = MySchema.safeParse(raw); if (!result.success) throw result.error;',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY', 'AUDIT'] }],
  bulletTemplate: 'VALID-RUNTIME-GUARD-JSON: JSON.parse at {line} cast to type without shape validation. Add schema guard.',
  warheadTemplate: 'JSON.parse returns whatever the source contained. A cast lies to the compiler. Only a runtime schema check proves the shape.',
  evidenceSpec: { id: 'rt-guard-json', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 1,
  links: ['VALID-ASYNC-PARSE', 'VALID-SCHEMA-FIRST', 'AP-UNSAFE-CAST'],
  selfVerified: true,
};

// ══ TYPE-LEVEL VALIDATION (7 nodes) ════════════════════════════

export const VALID_TYPES_EXACT: KnowledgeNode = {
  id: 'VALID-TYPES-EXACT',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'TYPES — EXACT: Use exact types (not widened general types) for validated domain data. Narrowed/exact types prevent invalid field combinations from compiling.',
  detectionMethod: 'AST: Find interfaces/types with broad optional fields that could represent invalid states. Flag where a discriminated union or exact type is safer.',
  fixTemplate: 'type UserCreated = { status: "created"; id: string }; type UserPending = { status: "pending"; token: string }; type User = UserCreated | UserPending;',
  conditions: [{ field: 'gate', op: 'in', value: ['VERIFY'] }],
  bulletTemplate: 'VALID-TYPES-EXACT: Loose type at {line} allows invalid states. Use exact/discriminated types.',
  warheadTemplate: 'Exact types make invalid data unrepresentable at compile time, eliminating a whole category of runtime checks.',
  evidenceSpec: { id: 'types-exact', verify: 'exec-tsc', minQuality: 0.95 },
  severity: 'block',
  layer: 2,
  links: ['VALID-TYPES-DISCRIMINATED-UNION', 'VALID-SCHEMA-FIRST', 'P2-TYPE-CERTAINTY'],
  selfVerified: true,
};

export const VALID_TYPES_BRANDED: KnowledgeNode = {
  id: 'VALID-TYPES-BRANDED',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'TYPES — BRANDED: Use branded/opaque types for domain primitives (UserId, Email, Url) that must be validated at construction. Branding prevents passing a raw string where a validated value is required.',
  detectionMethod: 'AST: Find function signatures where domain primitives are typed as plain `string`/`number` and constructed without validation. Flag.',
  fixTemplate: 'type UserId = string & { readonly __brand: "UserId" }; function userId(s: string): UserId { if (!/^[a-z]+$/.test(s)) throw new TypeError("UserId"); return s as UserId; }',
  conditions: [{ field: 'gate', op: 'in', value: ['VERIFY'] }],
  bulletTemplate: 'VALID-TYPES-BRANDED: Domain primitive at {line} typed as plain string. Use branded type with construction validation.',
  warheadTemplate: 'Branded types encode validation guarantees in the type system — a `UserId` can only exist if it passed construction validation.',
  evidenceSpec: { id: 'types-branded', verify: 'exec-tsc', minQuality: 0.95 },
  severity: 'block',
  layer: 2,
  links: ['VALID-TYPES-NOMINAL', 'VALID-SCHEMA-FIRST', 'P2-TYPE-CERTAINTY'],
  selfVerified: true,
};

export const VALID_TYPES_NOMINAL: KnowledgeNode = {
  id: 'VALID-TYPES-NOMINAL',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'TYPES — NOMINAL: Use nominal typing to keep distinct concepts distinct (e.g. Celsius vs Fahrenheit, UserId vs OrderId) even when structurally identical. Prevents cross-assignment bugs.',
  detectionMethod: 'AST: Find distinct domain values sharing an identical structural type (two ID string types, two money numbers) that can be freely assigned to each other. Flag.',
  fixTemplate: 'type OrderId = number & { __nominal: "OrderId" }; type UserId = number & { __nominal: "UserId" }; // cannot assign OrderId to UserId',
  conditions: [{ field: 'gate', op: 'in', value: ['VERIFY'] }],
  bulletTemplate: 'VALID-TYPES-NOMINAL: Structurally-identical distinct concepts at {line}. Use nominal typing to prevent cross-assignment.',
  warheadTemplate: 'Nominal typing prevents the compiler from silently accepting a UserId where an OrderId is required — a class of bug invisible to structural-only checks.',
  evidenceSpec: { id: 'types-nominal', verify: 'exec-tsc', minQuality: 0.95 },
  severity: 'block',
  layer: 2,
  links: ['VALID-TYPES-BRANDED', 'VALID-TYPES-EXACT', 'P2-TYPE-CERTAINTY'],
  selfVerified: true,
};

export const VALID_TYPES_TEMPLATE_LITERAL: KnowledgeNode = {
  id: 'VALID-TYPES-TEMPLATE-LITERAL',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'TYPES — TEMPLATE LITERAL: Use template literal types to encode string patterns (URLs, ISO dates, hex colors) so the compiler rejects malformed literals.',
  detectionMethod: 'AST: Find string parameters expected to match a pattern (URL, date, hex) typed as plain `string`. Flag.',
  fixTemplate: 'type IsoDate = `${number}-${number}-${number}T${number}:${number}:${number}Z`; function logAt(t: IsoDate) {} // "2024-01-01T00:00:00Z" ok',
  conditions: [{ field: 'gate', op: 'in', value: ['VERIFY'] }],
  bulletTemplate: 'VALID-TYPES-TEMPLATE-LITERAL: Patterned string at {line} typed as plain string. Use template literal type.',
  warheadTemplate: 'Template literal types encode pattern validation in the type system, rejecting malformed literals at compile time.',
  evidenceSpec: { id: 'types-tl', verify: 'exec-tsc', minQuality: 0.95 },
  severity: 'block',
  layer: 2,
  links: ['VALID-TYPES-BRANDED', 'VALID-STRING-FORMAT', 'P2-TYPE-CERTAINTY'],
  selfVerified: true,
};

export const VALID_TYPES_DISCRIMINATED_UNION: KnowledgeNode = {
  id: 'VALID-TYPES-DISCRIMINATED-UNION',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'TYPES — DISCRIMINATED UNION: Use discriminated unions (shared literal `tag`) to model variants. Runtime narrowing on the tag guarantees exhaustive handling and validates variant shape.',
  detectionMethod: 'AST: Find unions of object types lacking a common literal discriminator, or switch statements on variants without exhaustive default. Flag.',
  fixTemplate: 'type Result<T> = { ok: true; value: T } | { ok: false; error: Error }; function handle(r: Result<X>) { if (r.ok) r.value; else r.error; }',
  conditions: [{ field: 'gate', op: 'in', value: ['VERIFY', 'AUDIT'] }],
  bulletTemplate: 'VALID-TYPES-DISCRIMINATED-UNION: Union at {line} lacks a discriminator. Add a literal tag for safe narrowing.',
  warheadTemplate: 'A discriminator makes variant narrowing a single check and enables exhaustive switch validation, catching missing branches.',
  evidenceSpec: { id: 'types-du', verify: 'exec-tsc', minQuality: 0.95 },
  severity: 'block',
  layer: 2,
  links: ['VALID-TYPES-RESULT', 'VALID-RUNTIME-GUARD-UNKNOWN', 'VALID-TYPES-EXACT', 'P2-TYPE-CERTAINTY'],
  selfVerified: true,
};

export const VALID_TYPES_RESULT: KnowledgeNode = {
  id: 'VALID-TYPES-RESULT',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'TYPES — RESULT: Use Result<T, E> for fallible operations instead of throw/catch. Errors become values that the type system forces callers to handle.',
  detectionMethod: 'CFG: Find functions that throw where the caller does not statically know failure is possible, or that return `undefined` on error. Flag for Result<T, E>.',
  fixTemplate: 'type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E }; function parse(s: string): Result<number> { const n = Number(s); return Number.isNaN(n) ? { ok: false, error: new Error("nan") } : { ok: true, value: n }; }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY'] }],
  bulletTemplate: 'VALID-TYPES-RESULT: Throw/return-undefined at {line}. Return Result<T, E> to make error handling explicit.',
  warheadTemplate: 'Result<T, E> makes failure a visible part of the return type, forcing every caller to confront the error path — unlike exceptions which are silently ignorable.',
  evidenceSpec: { id: 'types-result', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 2,
  links: ['VALID-TYPES-DISCRIMINATED-UNION', 'VALID-TYPES-OPTIONAL', 'TS-SF-ERROR-RETURN', 'P3-ERROR-COMPLETENESS'],
  selfVerified: true,
};

export const VALID_TYPES_OPTIONAL: KnowledgeNode = {
  id: 'VALID-TYPES-OPTIONAL',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'TYPES — OPTIONAL: Use Optional<T> (Some/None) or explicit nullable unions instead of `undefined`/`null` silently. Force callers to distinguish "absent" from "present-empty".',
  detectionMethod: 'AST: Find functions returning `T | undefined`/`T | null` where callers do not check, and find `.x` access on possibly-null values. Flag.',
  fixTemplate: 'type Optional<T> = { tag: "some"; value: T } | { tag: "none" }; function find(): Optional<User> { return u ? { tag: "some", value: u } : { tag: "none" }; }',
  conditions: [{ field: 'gate', op: 'in', value: ['VERIFY'] }],
  bulletTemplate: 'VALID-TYPES-OPTIONAL: Nullable return at {line} without explicit Optional. Use Some/None to force handling.',
  warheadTemplate: 'Optional<T> removes the ambiguity between "no value" and "value is empty", eliminating null-deref and forgotten-null-check bugs.',
  evidenceSpec: { id: 'types-optional', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 2,
  links: ['VALID-TYPES-RESULT', 'FM19-NULL-DEREFERENCE', 'P3-ERROR-COMPLETENESS'],
  selfVerified: true,
};

// ══ ASYNC VALIDATION (5 nodes) ═════════════════════════════════

export const VALID_ASYNC_PARSE: KnowledgeNode = {
  id: 'VALID-ASYNC-PARSE',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'ASYNC — SAFE PARSE: Wrap JSON.parse in a safe parser that catches syntax errors and validates shape. Never let a malformed payload crash the process or produce an `any`.',
  detectionMethod: 'CFG: Find bare `JSON.parse` whose result flows into typed code without try/catch and schema validation. Flag.',
  fixTemplate: 'function safeParse<T>(text: string, schema: Schema<T>): Result<T> { try { return schema.parse(JSON.parse(text)); } catch (e) { return { ok: false, error: e }; } }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY'] }],
  bulletTemplate: 'VALID-ASYNC-PARSE: Bare JSON.parse at {line}. Wrap in safeParse with try/catch + schema.',
  warheadTemplate: 'A malformed JSON payload must never crash the consumer. Safe parsing returns a typed Result instead of throwing or producing unvalidated `any`.',
  evidenceSpec: { id: 'async-parse', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 1,
  links: ['VALID-RUNTIME-GUARD-JSON', 'VALID-TYPES-RESULT', 'VALID-ASYNC-FETCH', 'AP-EMPTY-CATCH'],
  selfVerified: true,
};

export const VALID_ASYNC_FETCH: KnowledgeNode = {
  id: 'VALID-ASYNC-FETCH',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'ASYNC — FETCH: Validate HTTP response status, content-type, and body shape before using the payload. A 200 with the wrong content-type or shape is untrusted.',
  detectionMethod: 'CFG: Find `fetch(...)` followed by `.json()` used directly without status/content-type checks and schema validation. Flag.',
  fixTemplate: 'const res = await fetch(url); if (!res.ok) throw new Error(`${res.status}`); const ct = res.headers.get("content-type"); if (ct !== "application/json") throw new Error("ct"); const data = Schema.parse(await res.json());',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY'] }],
  bulletTemplate: 'VALID-ASYNC-FETCH: fetch response at {line} used without status/content-type/shape checks. Validate.',
  warheadTemplate: 'Network responses are adversarial. Status, content-type, and body must all be validated — a 200 with wrong content-type can still be an attack.',
  evidenceSpec: { id: 'async-fetch', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 1,
  links: ['VALID-RUNTIME-GUARD-BOUNDARY', 'VALID-ASYNC-PARSE', 'VALID-ASYNC-TIMEOUT', 'SEC-NETWORK-MODEL'],
  selfVerified: true,
};

export const VALID_ASYNC_DB: KnowledgeNode = {
  id: 'VALID-ASYNC-DB',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'ASYNC — DB: Validate database query results before use. Rows can be null, missing columns, or wrong types; validate row shape against the domain schema.',
  detectionMethod: 'CFG: Find DB query results (rows, findMany, findOne) used without a shape/row validator. Also flag `first()`/`findOne()` results dereferenced without null check. Flag.',
  fixTemplate: 'const row = await db.users.findOne({ id }); if (!row) throw new NotFound(); const user = UserSchema.parse(row); // validate shape',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY'] }],
  bulletTemplate: 'VALID-ASYNC-DB: DB result at {line} used without row validation. Validate shape and nullability.',
  warheadTemplate: 'Database rows are external data. Schema drift, nullable columns, and migrations make raw rows untrusted until validated against the domain schema.',
  evidenceSpec: { id: 'async-db', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 1,
  links: ['VALID-RUNTIME-GUARD-BOUNDARY', 'VALID-COMPLEX-NESTED', 'PERSIST-SQLITE-WAL', 'FM19-NULL-DEREFERENCE'],
  selfVerified: true,
};

export const VALID_ASYNC_TIMEOUT: KnowledgeNode = {
  id: 'VALID-ASYNC-TIMEOUT',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'ASYNC — TIMEOUT: Every async operation with an unbounded wait (fetch, DB, IPC) must have an explicit timeout. Validate that the result arrived within the bound, else reject.',
  detectionMethod: 'CFG: Find await expressions on fetch/DB/network without an AbortSignal or Promise.race timeout wrapper. Flag.',
  fixTemplate: 'const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 5000); try { return await fetch(url, { signal: ctrl.signal }); } finally { clearTimeout(t); }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY'] }],
  bulletTemplate: 'VALID-ASYNC-TIMEOUT: Async op at {line} without timeout. Add AbortSignal or Promise.race bound.',
  warheadTemplate: 'Unbounded async waits hang services indefinitely. A timeout converts indefinite hangs into explicit, handled failures.',
  evidenceSpec: { id: 'async-timeout', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 1,
  links: ['VALID-ASYNC-FETCH', 'CONC-CIRCUIT-BREAKER', 'P9-ASYNC-DISCIPLINE', 'FM05-UNHANDLED-REJECTION'],
  selfVerified: true,
};

export const VALID_ASYNC_RETRY: KnowledgeNode = {
  id: 'VALID-ASYNC-RETRY',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'ASYNC — RETRY: When retrying, re-validate the result between attempts. A transient success may return a partial/stale value; never blindly accept a retried payload.',
  detectionMethod: 'CFG: Find retry loops that accept the first non-throwing result without re-validating the payload shape. Flag.',
  fixTemplate: 'for (let i = 0; i < 3; i++) { try { const d = await fetch(url); const v = Schema.safeParse(await d.json()); if (v.success) return v.data; } catch {} await sleep(backoff(i)); }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY'] }],
  bulletTemplate: 'VALID-ASYNC-RETRY: Retry loop at {line} accepts result without re-validation. Validate each attempt.',
  warheadTemplate: 'Retry hides transient errors but can also mask persistent shape problems. Re-validating every attempt ensures only conforming data is accepted.',
  evidenceSpec: { id: 'async-retry', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 1,
  links: ['VALID-ASYNC-FETCH', 'VALID-ASYNC-TIMEOUT', 'CONC-EXP-BACKOFF', 'CONC-RETRY-BUDGET'],
  selfVerified: true,
};

// ══ COMPLEX STRUCTURE VALIDATION (5 nodes) ═════════════════════

export const VALID_COMPLEX_NESTED: KnowledgeNode = {
  id: 'VALID-COMPLEX-NESTED',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'COMPLEX — NESTED: Validate deeply nested objects recursively. A shallow check on the top level leaves inner objects untrusted; traverse and validate every level.',
  detectionMethod: 'CFG: Find schema/type guards that check only top-level keys of a nested payload then cast inner fields. Flag — nested data is untrusted.',
  fixTemplate: 'const Nested = z.object({ user: z.object({ profile: z.object({ name: z.string() }) }) }); // recursive validation down to leaves',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY'] }],
  bulletTemplate: 'VALID-COMPLEX-NESTED: Shallow validation at {line} leaves nested fields untrusted. Validate every level.',
  warheadTemplate: 'Corruption can hide at any depth. Only recursive/recursive-schema validation proves the entire nested structure conforms.',
  evidenceSpec: { id: 'complex-nested', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 2,
  links: ['VALID-SCHEMA-FIRST', 'VALID-COMPLEX-ARRAY', 'VALID-COMPLEX-MAP', 'VALID-ASYNC-DB'],
  selfVerified: true,
};

export const VALID_COMPLEX_ARRAY: KnowledgeNode = {
  id: 'VALID-COMPLEX-ARRAY',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'COMPLEX — ARRAY: Validate every element of an array homogeneously. A type-checked first element does not prove the rest; use element-wise guards (.every / z.array).',
  detectionMethod: 'CFG: Find array values typed `T[]` where only one element is checked, or where `.map`/`.filter` cast without per-element validation. Flag.',
  fixTemplate: 'function isUsers(v: unknown): v is User[] { return Array.isArray(v) && v.every(isUser); }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY'] }],
  bulletTemplate: 'VALID-COMPLEX-ARRAY: Array at {line} validated by sampling/casting. Validate every element homogeneously.',
  warheadTemplate: 'Heterogeneous junk in an array passes a single-element check. Only `.every`/`z.array(ElementSchema)` proves all elements conform.',
  evidenceSpec: { id: 'complex-array', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 2,
  links: ['VALID-COMPLEX-NESTED', 'VALID-COMPLEX-MAP', 'TS-SF-HANDLE-ZERO'],
  selfVerified: true,
};

export const VALID_COMPLEX_MAP: KnowledgeNode = {
  id: 'VALID-COMPLEX-MAP',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'COMPLEX — MAP/RECORD: Validate Map and Record structures by checking both keys and values. A Record<string, T> is not proven T just because the type says so.',
  detectionMethod: 'CFG: Find Record/Map/`{ [k]: V }` values iterated with values cast to V without per-value validation. Flag.',
  fixTemplate: 'function isStrMap(v: unknown): v is Record<string, number> { if (typeof v !== "object" || v === null) return false; return Object.entries(v).every(([k, n]) => typeof k === "string" && typeof n === "number"); }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY'] }],
  bulletTemplate: 'VALID-COMPLEX-MAP: Record/Map at {line} values cast without validation. Validate keys and values.',
  warheadTemplate: 'Record and Map values are not type-checked at runtime. Prototypal keys and bad values slip through unless every entry is validated.',
  evidenceSpec: { id: 'complex-map', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 2,
  links: ['VALID-COMPLEX-ARRAY', 'VALID-COMPLEX-NESTED', 'VALID-SECURITY-PROTOTYPE-POLLUTION'],
  selfVerified: true,
};

export const VALID_COMPLEX_UNION: KnowledgeNode = {
  id: 'VALID-COMPLEX-UNION',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'COMPLEX — UNION: Validate union types at runtime by checking every member in order, defaulting to rejection if none match. A union that passes `any` member unchecked is unsafe.',
  detectionMethod: 'CFG: Find `unknown`/union values narrowed by a single branch without exhaustive member checks and a final reject. Flag.',
  fixTemplate: 'function parse(v: unknown): A | B { if (isA(v)) return v; if (isB(v)) return v; throw new TypeError("neither A nor B"); }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY'] }],
  bulletTemplate: 'VALID-COMPLEX-UNION: Union at {line} narrowed by one branch without exhaustive checks. Check all members, reject else.',
  warheadTemplate: 'A union validated by its first member alone accepts data that matches no member. Exhaustive member checks with a final reject guarantee correctness.',
  evidenceSpec: { id: 'complex-union', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 2,
  links: ['VALID-TYPES-DISCRIMINATED-UNION', 'VALID-RUNTIME-GUARD-UNKNOWN', 'VALID-COMPLEX-INTERSECTION'],
  selfVerified: true,
};

export const VALID_COMPLEX_INTERSECTION: KnowledgeNode = {
  id: 'VALID-COMPLEX-INTERSECTION',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'COMPLEX — INTERSECTION: Validate intersection types (A & B) by checking both A and B independently. Satisfying one does not imply the other; both must pass.',
  detectionMethod: 'CFG: Find intersection-typed (A & B) values validated by a single member guard. Flag — the other half is untrusted.',
  fixTemplate: 'function isAB(v: unknown): v is A & B { return isA(v) && isB(v); } // both must hold',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY'] }],
  bulletTemplate: 'VALID-COMPLEX-INTERSECTION: Intersection at {line} validated by one member. Check both A and B.',
  warheadTemplate: 'An intersection requires both constituents. Validating only one admits data missing the other half — a hidden invariant violation.',
  evidenceSpec: { id: 'complex-intersection', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 2,
  links: ['VALID-COMPLEX-UNION', 'VALID-TYPES-EXACT', 'VALID-RUNTIME-GUARD-UNKNOWN'],
  selfVerified: true,
};

// ══ SECURITY VALIDATION (5 nodes) ══════════════════════════════

export const VALID_SECURITY_SQL_INJECTION: KnowledgeNode = {
  id: 'VALID-SECURITY-SQL-INJECTION',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'SECURITY — SQL INJECTION: Validate all SQL inputs via parameterized queries/placeholders. Never concatenate user data into SQL; any string in a query is an injection vector.',
  detectionMethod: 'AST: Find query strings built with template literals or concatenation containing variables/user input. Flag — use parameterized queries.',
  fixTemplate: 'const rows = await db.query("SELECT * FROM u WHERE id = $1", [id]); // placeholder, never `... WHERE id = ${id}`',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY', 'AUDIT'] }],
  bulletTemplate: 'VALID-SECURITY-SQL-INJECTION: SQL string built with interpolation at {line}. Use parameterized query.',
  warheadTemplate: 'String-interpolated SQL is a direct injection path. Parameterized queries make data and code structurally separate.',
  evidenceSpec: { id: 'sec-sql', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 1,
  links: ['SEC-INJECTION-DIRECT', 'SEC-INJECTION-INDIRECT', 'VALID-RUNTIME-GUARD-BOUNDARY', 'VALID-NUMERIC-RANGE'],
  selfVerified: true,
};

export const VALID_SECURITY_XSS: KnowledgeNode = {
  id: 'VALID-SECURITY-XSS',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'SECURITY — XSS: Validate and escape all user-supplied content before rendering to HTML. Encode on output context (HTML attr, text, JS, URL) — never trust input sanitization alone.',
  detectionMethod: 'AST: Find innerHTML / dangerouslySetInnerHTML / template rendering of unvalidated variables. Also find user content inserted without context-aware escaping. Flag.',
  fixTemplate: 'el.textContent = userInput; // not innerHTML; or escapeHtml(userInput) for HTML context',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY', 'AUDIT'] }],
  bulletTemplate: 'VALID-SECURITY-XSS: Unescaped user content rendered at {line}. Escape per output context.',
  warheadTemplate: 'XSS executes attacker script in the user session. Context-aware output encoding is the only reliable defense; input filtering is insufficient.',
  evidenceSpec: { id: 'sec-xss', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 1,
  links: ['SEC-INJECTION-DIRECT', 'SEC-INJECTION-ENCODING', 'VALID-RUNTIME-GUARD-BOUNDARY'],
  selfVerified: true,
};

export const VALID_SECURITY_COMMAND_INJECTION: KnowledgeNode = {
  id: 'VALID-SECURITY-COMMAND-INJECTION',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'SECURITY — COMMAND INJECTION: Validate shell command arguments against an allowlist; pass arguments as an array, never via a single shell string. Reject metacharacters (; | & $ `).',
  detectionMethod: 'AST: Find exec/execSync/spawn calls with shell strings containing user input, or single-string command forms. Flag — use array args + allowlist.',
  fixTemplate: 'const safe = allowlist.has(arg) ? arg : undefined; if (!safe) throw new Error("disallowed"); execFile("ls", ["-l", safe]); // array form, no shell',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY', 'AUDIT'] }],
  bulletTemplate: 'VALID-SECURITY-COMMAND-INJECTION: Shell command built with user input at {line}. Use array args + allowlist.',
  warheadTemplate: 'Shell metacharacters turn arguments into commands. Array-form invocation with allowlisting removes the shell entirely.',
  evidenceSpec: { id: 'sec-cmd', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 1,
  links: ['SEC-INJECTION-DIRECT', 'SEC-INJECTION-INDIRECT', 'VALID-RUNTIME-GUARD-BOUNDARY', 'SEC-CAPABILITY-PROCESS'],
  selfVerified: true,
};

export const VALID_SECURITY_PATH_TRAVERSAL: KnowledgeNode = {
  id: 'VALID-SECURITY-PATH-TRAVERSAL',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'SECURITY — PATH TRAVERSAL: Validate that user-supplied paths resolve within an allowed root. Reject `..`, absolute paths, and symlinks escaping the base directory.',
  detectionMethod: 'AST: Find fs operations (readFile, writeFile, join) using raw user input in the path without canonicalization and prefix containment check. Flag.',
  fixTemplate: 'const resolved = path.resolve(base, userInput); if (!resolved.startsWith(base + path.sep)) throw new Error("traversal");',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY', 'AUDIT'] }],
  bulletTemplate: 'VALID-SECURITY-PATH-TRAVERSAL: User path used at {line} without containment check. Resolve and verify within base.',
  warheadTemplate: '`..` segments and absolute paths escape intended directories. Resolving canonically and checking prefix containment closes the traversal vector.',
  evidenceSpec: { id: 'sec-path', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 1,
  links: ['SEC-INJECTION-DIRECT', 'TS-SF-NO-HARD-PATH', 'VALID-RUNTIME-GUARD-BOUNDARY', 'SEC-CAPABILITY-FS'],
  selfVerified: true,
};

export const VALID_SECURITY_PROTOTYPE_POLLUTION: KnowledgeNode = {
  id: 'VALID-SECURITY-PROTOTYPE-POLLUTION',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'SECURITY — PROTOTYPE POLLUTION: Validate that object keys never include `__proto__`, `constructor`, or `prototype` before merging/assigning. Reject dangerous keys at the boundary.',
  detectionMethod: 'CFG: Find Object.assign / spread / recursive merge of user-controlled objects without key filtering for `__proto__`/`constructor`/`prototype`. Flag.',
  fixTemplate: 'const SAFE = ["__proto__", "constructor", "prototype"]; for (const k of Object.keys(src)) if (SAFE.includes(k)) throw new Error("pollution"); Object.assign(dst, src);',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY', 'AUDIT'] }],
  bulletTemplate: 'VALID-SECURITY-PROTOTYPE-POLLUTION: User object merged at {line} without key filtering. Reject `__proto__`/`constructor`.',
  warheadTemplate: 'Prototype pollution injects properties into all objects globally. Filtering dangerous keys before any merge is mandatory at boundaries.',
  evidenceSpec: { id: 'sec-proto', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 1,
  links: ['SEC-INJECTION-INDIRECT', 'VALID-COMPLEX-MAP', 'VALID-RUNTIME-GUARD-JSON'],
  selfVerified: true,
};

// ══ INTEGRITY VALIDATION (5 nodes) ═════════════════════════════

export const VALID_IMMUTABLE_FREEZE: KnowledgeNode = {
  id: 'VALID-IMMUTABLE-FREEZE',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'INTEGRITY — IMMUTABILITY: Validate immutability of returned/shared data with readonly types and Object.freeze. Validated data must not be mutated after validation or the guarantee is void.',
  detectionMethod: 'AST: Find validated data returned/shared as mutable (non-readonly) types, or shared arrays without Object.freeze. Flag.',
  fixTemplate: 'function all(xs: readonly X[]): readonly X[] { const frozen = Object.freeze([...xs]); return frozen; } // readonly type + freeze',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY'] }],
  bulletTemplate: 'VALID-IMMUTABLE-FREEZE: Validated data at {line} is mutable. Use readonly + Object.freeze.',
  warheadTemplate: 'Validation proves a snapshot in time. If the data is mutable afterwards, the validation guarantee can be silently invalidated by a later mutation.',
  evidenceSpec: { id: 'integ-freeze', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 2,
  links: ['VALID-RUNTIME-GUARD-OUTPUT', 'VALID-SCHEMA-FIRST', 'P5-ATOMIC-STATE'],
  selfVerified: true,
};

export const VALID_NUMERIC_RANGE: KnowledgeNode = {
  id: 'VALID-NUMERIC-RANGE',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'INTEGRITY — NUMERIC RANGE: Validate numeric ranges and bounds before any arithmetic or use. Check NaN, Infinity, and domain bounds (e.g. quantity >= 0, price > 0).',
  detectionMethod: 'CFG: Find numeric inputs used in arithmetic or as bounds without a preceding NaN/range check. Flag.',
  fixTemplate: 'function priceOf(n: number): number { if (!Number.isFinite(n) || n <= 0) throw new RangeError("price"); return n; }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY'] }],
  bulletTemplate: 'VALID-NUMERIC-RANGE: Number at {line} used without NaN/range check. Validate finite and domain bounds.',
  warheadTemplate: 'NaN poisons every downstream computation silently. Range checks catch NaN, Infinity, and out-of-domain values before they corrupt results.',
  evidenceSpec: { id: 'integ-range', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 2,
  links: ['VALID-RUNTIME-GUARD-ENV', 'VALID-SECURITY-SQL-INJECTION', 'TS-SF-HANDLE-ZERO'],
  selfVerified: true,
};

export const VALID_REDACT_SECRETS: KnowledgeNode = {
  id: 'VALID-REDACT-SECRETS',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'INTEGRITY — SECRET REDACTION: Validate that secrets (tokens, keys, passwords) are redacted before logging, error messages, or serialization. Never log raw credential fields.',
  detectionMethod: 'CFG: Find logger calls / Error messages / JSON.stringify over objects containing known secret-named fields (token, password, key, secret) without redaction. Flag.',
  fixTemplate: 'function redact<T>(o: T): T { const c = structuredClone(o); for (const k of SECRET_KEYS) if (k in c) (c as any)[k] = "***"; return c; } log(redact(record));',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY', 'AUDIT'] }],
  bulletTemplate: 'VALID-REDACT-SECRETS: Secret field logged/serialized at {line}. Redact before any output channel.',
  warheadTemplate: 'Secrets in logs and errors are exfiltrated via log aggregation and crash reports. Redaction at the validation boundary is the last reliable gate.',
  evidenceSpec: { id: 'integ-redact', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 1,
  links: ['SEC-INFO-FLOW-TAINT', 'SEC-AUDIT-TRAIL', 'VALID-RUNTIME-GUARD-OUTPUT'],
  selfVerified: true,
};

export const VALID_CIRCULAR_REF: KnowledgeNode = {
  id: 'VALID-CIRCULAR-REF',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'INTEGRITY — CIRCULAR REFS: Validate that external data has no circular references before serialization (JSON.stringify) or deep traversal. Circular refs throw or recurse infinitely.',
  detectionMethod: 'CFG: Find JSON.stringify / deep-clone / recursive traversal over untrusted parsed data without a circular-reference (seen-set) guard. Flag.',
  fixTemplate: 'function hasCycle(o: unknown, seen = new WeakSet()): boolean { if (typeof o !== "object" || o === null) return false; if (seen.has(o)) return true; seen.add(o); return Object.values(o).some(v => hasCycle(v, seen)); }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY'] }],
  bulletTemplate: 'VALID-CIRCULAR-REF: Untrusted data serialized/traversed at {line} without cycle check. Guard with seen-set.',
  warheadTemplate: 'Circular references cause JSON.stringify to throw and recursive walks to overflow the stack. A seen-set guard converts a crash into a handled rejection.',
  evidenceSpec: { id: 'integ-circular', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 2,
  links: ['VALID-ASYNC-PARSE', 'VALID-COMPLEX-NESTED', 'VALID-RUNTIME-GUARD-JSON'],
  selfVerified: true,
};

export const VALID_COERCION_EXPLICIT: KnowledgeNode = {
  id: 'VALID-COERCION-EXPLICIT',
  source: 'ts-deep',
  sourceFile: 'KB-02_DATA_VALIDATION_DEEP.md',
  category: 'data-validation',
  rule: 'INTEGRITY — EXPLICIT COERCION: Validate types via explicit coercion (Number, Boolean, String) with result checks, never rely on implicit coercion. Implicit coercion yields NaN/""/"undefined" silently.',
  detectionMethod: 'CFG: Find arithmetic between mixed types (`x + y` where one is string), truthiness checks on numbers, and `==` comparisons across types. Flag.',
  fixTemplate: 'const n = Number(raw); if (!Number.isFinite(n)) throw new TypeError("not a number"); if (raw === "") throw new TypeError("empty"); // explicit, not `+raw` or `==`',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY'] }],
  bulletTemplate: 'VALID-COERCION-EXPLICIT: Implicit coercion at {line}. Use explicit Number()/Boolean() with result validation.',
  warheadTemplate: 'Implicit coercion (`+x`, `x == "0"`, `if (count)`) hides NaN, empty-string, and zero-as-falsy bugs. Explicit coercion with checks makes the result provably correct.',
  evidenceSpec: { id: 'integ-coerce', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 2,
  links: ['VALID-NUMERIC-RANGE', 'VALID-RUNTIME-GUARD-ENV', 'TS-SF-NO-ANY'],
  selfVerified: true,
};

// ══ EXPORTS ═════════════════════════════════════════════════════

export const dataValidationNodes: KnowledgeNode[] = [
  // Schema-first
  VALID_SCHEMA_FIRST,
  // Runtime guards
  VALID_RUNTIME_GUARD_INPUT, VALID_RUNTIME_GUARD_OUTPUT, VALID_RUNTIME_GUARD_BOUNDARY,
  VALID_RUNTIME_GUARD_CONFIG, VALID_RUNTIME_GUARD_ENV, VALID_RUNTIME_GUARD_UNKNOWN, VALID_RUNTIME_GUARD_JSON,
  // Type-level validation
  VALID_TYPES_EXACT, VALID_TYPES_BRANDED, VALID_TYPES_NOMINAL, VALID_TYPES_TEMPLATE_LITERAL,
  VALID_TYPES_DISCRIMINATED_UNION, VALID_TYPES_RESULT, VALID_TYPES_OPTIONAL,
  // Async validation
  VALID_ASYNC_PARSE, VALID_ASYNC_FETCH, VALID_ASYNC_DB, VALID_ASYNC_TIMEOUT, VALID_ASYNC_RETRY,
  // Complex structures
  VALID_COMPLEX_NESTED, VALID_COMPLEX_ARRAY, VALID_COMPLEX_MAP, VALID_COMPLEX_UNION, VALID_COMPLEX_INTERSECTION,
  // Security validation
  VALID_SECURITY_SQL_INJECTION, VALID_SECURITY_XSS, VALID_SECURITY_COMMAND_INJECTION,
  VALID_SECURITY_PATH_TRAVERSAL, VALID_SECURITY_PROTOTYPE_POLLUTION,
  // Integrity validation
  VALID_IMMUTABLE_FREEZE, VALID_NUMERIC_RANGE, VALID_REDACT_SECRETS,
  VALID_CIRCULAR_REF, VALID_COERCION_EXPLICIT,
];
