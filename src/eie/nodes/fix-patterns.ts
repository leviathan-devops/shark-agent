/**
 * src/eie/nodes/fix-patterns.ts — 60 Fix Pattern Nodes (FX-01 through FX-60)
 *
 * Fix templates for each anti-pattern and failure mode.
 * Source: Derived from all anti-patterns + failure modes + principles
 */

import type { KnowledgeNode } from '../types';

function fx(
  id: string, rule: string, fix: string, bullet: string,
  sev: 'block' | 'warn' | 'guide', layer: 0 | 1 | 2 | 3 | 4 | 5, links: string[],
): KnowledgeNode {
  return {
    id, source: 'alg-sys' as const, sourceFile: 'T3_ALGORITHMIC_SYSTEMS.md',
    category: 'fix-pattern' as const,
    rule, detectionMethod: 'Identify anti-pattern then apply this fix template.',
    fixTemplate: fix,
    conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY', 'AUDIT'] }],
    bulletTemplate: bullet,
    warheadTemplate: '# ' + id + '\n' + rule + '\n## Fix\n' + fix,
    evidenceSpec: { id: 'fix-applied', verify: 'rge-audit' as const, minQuality: 0.95 },
    severity: sev, layer, links, selfVerified: true,
  };
}

export const FX01_FIX_THEATRICAL_CODE: KnowledgeNode = fx('FX-01-FIX-THEATRICAL-CODE',
  'FIX for AP-THEATRICAL-CODE: Replace functions that claim work without doing it.',
  'function deploy(): DeployResult { execSync("bun build"); if (!fs.existsSync("dist/index.js")) throw new Error("build failed"); return { done: true }; }',
  'FX-01: Fix theatrical code — add real side effects.', 'block', 4, ['AP-THEATRICAL-CODE', 'FM-09-THEATRICAL-COMPLETION']);

export const FX02_FIX_FAKE_TEST: KnowledgeNode = fx('FX-02-FIX-FAKE-TEST',
  'FIX for AP-FAKE-TEST: Replace expect(literal) with expect(function(input)).',
  'const result = add(40, 2); expect(result).toBe(42);',
  'FX-02: Fix fake test — call function, assert on output.', 'block', 4, ['AP-FAKE-TEST', 'FM-14-FAKE-TEST']);

export const FX03_FIX_EMPTY_CATCH: KnowledgeNode = fx('FX-03-FIX-EMPTY-CATCH',
  'FIX for AP-EMPTY-CATCH: Replace empty catches with log + recover or re-throw.',
  'catch (e: unknown) { const msg = e instanceof Error ? e.message : String(e); logger.error("[P3]", { error: msg }); return { ok: false, error: msg }; }',
  'FX-03: Fix empty catch — add log + recover or re-throw.', 'block', 1, ['AP-EMPTY-CATCH', 'FM-02-SILENT-DATA-CORRUPTION']);

export const FX04_FIX_UNSAFE_CAST: KnowledgeNode = fx('FX-04-FIX-UNSAFE-CAST',
  'FIX for AP-UNSAFE-CAST: Add runtime type guards before every as cast.',
  'if (typeof data !== "string") throw new TypeError("[P2]"); const len = data.length;',
  'FX-04: Fix unsafe cast — add typeof guard before as.', 'block', 1, ['AP-UNSAFE-CAST', 'FM-06-TYPE-CONFUSION']);

export const FX05_FIX_FLOATING_PROMISE: KnowledgeNode = fx('FX-05-FIX-FLOATING-PROMISE',
  'FIX for AP-FLOATING-PROMISE: Add catch or wrap in try-await-catch.',
  'try { const d = await fetchData(); process(d); } catch (e) { logger.error(e); }',
  'FX-05: Fix floating promise — add await+catch or catch handler.', 'block', 4, ['AP-FLOATING-PROMISE', 'FM-05-UNHANDLED-REJECTION']);

export const FX06_FIX_UNCLEANED_INTERVAL: KnowledgeNode = fx('FX-06-FIX-UNCLEANED-INTERVAL',
  'FIX for AP-UNCLEANED-INTERVAL: Wrap setInterval in try/finally.',
  'const iv = setInterval(poll, 1000); try { await doWork(); } finally { clearInterval(iv); }',
  'FX-06: Fix resource leak — add try/finally with clearInterval.', 'block', 4, ['AP-UNCLEANED-INTERVAL', 'FM-18-ZOMBIE-TIMER']);

export const FX07_FIX_HARDCODED_PATH: KnowledgeNode = fx('FX-07-FIX-HARDCODED-PATH',
  'FIX for AP-HARDCODED-PATH: Replace hardcoded paths with dynamic resolution.',
  'import * as path from "node:path"; const dir = path.join(__dirname, "..", "data");',
  'FX-07: Fix hardcoded path — use path.join(__dirname, ...).', 'block', 2, ['AP-HARDCODED-PATH', 'FM-07-ENV-DEPENDENCY']);

export const FX08_FIX_UNVALIDATED_CONFIG: KnowledgeNode = fx('FX-08-FIX-UNVALIDATED-CONFIG',
  'FIX for AP-UNVALIDATED-CONFIG: Add type + range + presence validation.',
  'const port = parseInt(process.env.PORT ?? "", 10); if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("[P8]");',
  'FX-08: Fix unvalidated config — add type+range+presence check.', 'block', 2, ['AP-UNVALIDATED-CONFIG', 'FM-08-CONFIG-INJECTION']);

export const FX09_FIX_TORN_STATE: KnowledgeNode = fx('FX-09-FIX-TORN-STATE',
  'FIX for AP-TORN-STATE: Use atomic spread or try/finally.',
  'try { const data = await fetch(); state = { ...state, loading: false, data }; } catch (e) { state = { ...state, loading: false, error: e }; }',
  'FX-09: Fix torn state — use atomic spread.', 'block', 4, ['AP-TORN-STATE', 'FM-04-TORN-STATE']);

export const FX10_FIX_DEAD_EXPORT: KnowledgeNode = fx('FX-10-FIX-DEAD-EXPORT',
  'FIX for AP-DEAD-EXPORT: Wire unused exports or remove them.',
  'Either: import { unusedFn } from "./mod.js"; unusedFn(); OR delete the export.',
  'FX-10: Fix dead export — wire it or delete it.', 'warn', 2, ['AP-DEAD-EXPORT', 'FM-12-DEAD-CODE']);

export const FX11_FIX_UNGROUNDED_CLAIM: KnowledgeNode = fx('FX-11-FIX-UNGROUNDED-CLAIM',
  'FIX for AP-UNGROUNDED-CLAIM: Provide mechanical evidence for every claim.',
  'Run: tsc --noEmit (store exit code), bun build (store exit code). Evidence = mechanical results.',
  'FX-11: Fix ungrounded claim — provide mechanical evidence.', 'block', 5, ['AP-UNGROUNDED-CLAIM', 'IL10-EVIDENCE-IS-MECHANICAL']);

export const FX12_FIX_MOCK_IN_PROD: KnowledgeNode = fx('FX-12-FIX-MOCK-IN-PROD',
  'FIX for AP-MOCK-IN-PRODUCTION: Replace mock implementations with real ones.',
  'function save() { fs.writeFileSync(path, data); return true; } // real work',
  'FX-12: Fix mock in production — replace with real implementation.', 'block', 4, ['AP-MOCK-IN-PRODUCTION', 'AP-MOCK-STUB']);

export const FX13_FIX_OPENCODE_RUN: KnowledgeNode = fx('FX-13-FIX-OPENCODE-RUN',
  'FIX for AP-OPENCODE-RUN: Replace opencode run with tmux interaction.',
  'Use tmux send-keys for natural language input: tmux send-keys -t session "task" Enter',
  'FX-13: Fix opencode run — use tmux send-keys.', 'block', 4, ['AP-OPENCODE-RUN', 'TEST-CONTAINER-TUI']);

export const FX14_FIX_DIRECT_SCRIPT: KnowledgeNode = fx('FX-14-FIX-DIRECT-SCRIPT',
  'FIX for AP-DIRECT-SCRIPT: Replace node -e with container TUI testing.',
  'Deploy dist to container, verify checksums, interact via tmux send-keys.',
  'FX-14: Fix direct script — use container TUI testing.', 'block', 4, ['AP-DIRECT-SCRIPT', 'TEST-CONTAINER-TUI']);

export const FX15_FIX_STATIC_GREP: KnowledgeNode = fx('FX-15-FIX-STATIC-GREP',
  'FIX for AP-STATIC-GREP: Replace grep on bundles with runtime observation.',
  'Run the built bundle in a container. Send tasks via tmux. Observe behavior.',
  'FX-15: Fix static grep — observe runtime behavior in container.', 'block', 4, ['AP-STATIC-GREP', 'TEST-CONTAINER-TUI']);

export const FX16_FIX_TEXT_MATCHING: KnowledgeNode = fx('FX-16-FIX-TEXT-MATCHING',
  'FIX for AP-TEXT-MATCHING: Replace text matching with mechanical observation.',
  'Observe mechanical behavior: check exit codes, file outputs, state changes.',
  'FX-16: Fix text matching — observe mechanical behavior.', 'block', 4, ['AP-TEXT-MATCHING', 'AP-IDENTITY-SPOOFING']);

export const FX17_FIX_SCOPE_CREEP: KnowledgeNode = fx('FX-17-FIX-SCOPE-CREEP',
  'FIX for AP-SCOPE-CREEP: Revert out-of-scope changes.',
  'git checkout -- out-of-scope-file; re-state task scope; resume from checkpoint.',
  'FX-17: Fix scope creep — revert out-of-scope changes.', 'block', 5, ['AP-SCOPE-CREEP', 'FM-13-SCOPE-CREEP']);

export const FX18_FIX_DUPLICATE_ENFORCEMENT: KnowledgeNode = fx('FX-18-FIX-DUPLICATE-ENFORCEMENT',
  'FIX for AP-DUPLICATE-ENFORCEMENT: Remove duplicate rule enforcement.',
  'Assign rule to one engine in RULE_OWNERSHIP. Remove from others.',
  'FX-18: Fix duplicate enforcement — assign single owner.', 'warn', 5, ['AP-DUPLICATE-ENFORCEMENT', 'IL13-RULE-OWNERSHIP-EXCLUSIVE']);

export const FX19_FIX_EVIDENCE_FABRICATION: KnowledgeNode = fx('FX-19-FIX-EVIDENCE-FABRICATION',
  'FIX for AP-EVIDENCE-FABRICATION: Produce real mechanical evidence.',
  'Execute mechanical check. Store result on disk. Verify with fs.existsSync.',
  'FX-19: Fix evidence fabrication — produce mechanical evidence.', 'block', 5, ['AP-EVIDENCE-FABRICATION', 'FM-11-EVIDENCE-FABRICATION']);

export const FX20_FIX_EMPTY_STATE: KnowledgeNode = fx('FX-20-FIX-EMPTY-STATE',
  'FIX for AP-EMPTY-STATE-FALSE-POSITIVE: Add length zero guards.',
  'if (items.length === 0) return { valid: false, reason: "empty" };',
  'FX-20: Fix empty state false positive — add length guard.', 'warn', 2, ['AP-EMPTY-STATE-FALSE-POSITIVE', 'FM-10-VACUOUS-VALIDATION']);

export const FX21_FIX_RETURN_NULL: KnowledgeNode = fx('FX-21-FIX-RETURN-NULL',
  'FIX for AP-RETURN-NULL-NONNULL: Replace null returns with throw or fallback.',
  'catch (e) { throw new Error("failed: " + e.message); } // for type: string',
  'FX-21: Fix return null for non-nullable — throw or return fallback.', 'block', 1, ['AP-RETURN-NULL-NONNULL', 'P10-OUTPUT-CONTRACT']);

export const FX22_FIX_HOST_FALLBACK: KnowledgeNode = fx('FX-22-FIX-HOST-FALLBACK',
  'FIX for AP-HOST-FALLBACK: Remove host filesystem fallback.',
  'Use path.join(process.cwd(), ...) exclusively. No fallback to host paths.',
  'FX-22: Fix host fallback — use container paths only.', 'block', 2, ['AP-HOST-FALLBACK', 'IL07-ENVIRONMENT-INDEPENDENCE']);

export const FX23_FIX_SUCCESS_CLAIM: KnowledgeNode = fx('FX-23-FIX-SUCCESS-CLAIM',
  'FIX for AP-SUCCESS-CLAIM: Gate advancement must be mechanical.',
  'Gate advance only after evidenceVerifier.verify(evidenceId) returns passed true.',
  'FX-23: Fix success claim — gate advance requires verified evidence.', 'block', 5, ['AP-SUCCESS-CLAIM', 'IL19-GATE-ORDER-IMMUTABLE']);

export const FX24_FIX_ENV_VAR_BYPASS: KnowledgeNode = fx('FX-24-FIX-ENV-VAR-BYPASS',
  'FIX for AP-ENV-VAR-BYPASS: Remove enforcement bypass env vars.',
  'Remove all if (process.env.SKIP_ENFORCEMENT) conditionals. Enforcement is unconditional.',
  'FX-24: Fix env var bypass — remove enforcement bypass.', 'block', 4, ['AP-ENV-VAR-BYPASS', 'SEC-GAMING-DISABLE']);

export const FX25_FIX_TOOL_BYPASS: KnowledgeNode = fx('FX-25-FIX-TOOL-BYPASS',
  'FIX for AP-TOOL-BLOCKING-BYPASS: Remove tool blocking bypass paths.',
  'All tools go through tool.before handler. No bypass. No direct execution.',
  'FX-25: Fix tool bypass — all tools through enforcement pipeline.', 'block', 4, ['AP-TOOL-BLOCKING-BYPASS', 'SEC-GAMING-BYPASS']);

export const FX26_FIX_PRIVILEGE_ESCALATION: KnowledgeNode = fx('FX-26-FIX-PRIVILEGE-ESC',
  'FIX for AP-PRIVILEGE-ESCALATION: Enforce capability boundaries.',
  'Each function has declared capabilities. No escalation beyond declaration.',
  'FX-26: Fix privilege escalation — enforce capabilities.', 'block', 4, ['AP-PRIVILEGE-ESCALATION', 'SEC-CAPABILITY-PROCESS']);

export const FX27_FIX_CONTAINER_ESCAPE: KnowledgeNode = fx('FX-27-FIX-CONTAINER-ESCAPE',
  'FIX for AP-CONTAINER-ESCAPE: Remove container escape attempts.',
  'Container is sandboxed. No access to host filesystem, network, or processes.',
  'FX-27: Fix container escape — remove host access.', 'block', 4, ['AP-CONTAINER-ESCAPE', 'SEC-SANDBOX-ISOLATION']);

export const FX28_FIX_NETWORK_EGRESS: KnowledgeNode = fx('FX-28-FIX-NETWORK-EGRESS',
  'FIX for AP-NETWORK-EGRESS: Remove unauthorized network calls.',
  'Network access is declared and enforced. No calls to unapproved endpoints.',
  'FX-28: Fix network egress — remove unauthorized calls.', 'block', 4, ['AP-NETWORK-EGRESS', 'SEC-NETWORK-MODEL']);

export const FX29_FIX_SELF_REFERENCE: KnowledgeNode = fx('FX-29-FIX-SELF-REFERENCE',
  'FIX for AP-SELF-REFERENCE: Separate enforcer from verifier.',
  'Enforcement is external. No function verifies its own output.',
  'FX-29: Fix self-reference — separate enforcer from verifier.', 'warn', 5, ['AP-SELF-REFERENCE']);

export const FX30_FIX_MODEL_RESTRICTION: KnowledgeNode = fx('FX-30-FIX-MODEL-RESTRICTION',
  'FIX for AP-MODEL-RESTRICTION: Remove artificial model restrictions.',
  'Remove restrictions that serve no security purpose.',
  'FX-30: Fix model restriction — remove unjustified limits.', 'guide', 2, ['AP-MODEL-RESTRICTION']);

export const FX31_FIX_SIMPLIFICATION: KnowledgeNode = fx('FX-31-FIX-SIMPLIFICATION',
  'FIX for AP-SIMPLIFICATION: Restore full implementation.',
  'Implement the full function. No stubs, no TODOs.',
  'FX-31: Fix simplification — implement full functionality.', 'warn', 4, ['AP-SIMPLIFICATION']);

export const FX32_FIX_CONFUSION: KnowledgeNode = fx('FX-32-FIX-CONFUSION',
  'FIX for AP-CONFUSION: Clarify with proper types and naming.',
  'Rename to descriptive name. Extract concerns. Add type annotations.',
  'FX-32: Fix confusion — rename, extract, type-annotate.', 'guide', 2, ['AP-CONFUSION']);

export const FX33_FIX_IMPATIENCE: KnowledgeNode = fx('FX-33-FIX-IMPATIENCE',
  'FIX for AP-IMPATIENCE: Complete all required steps.',
  'Complete every step in order. No skipping. No shortcuts.',
  'FX-33: Fix impatience — complete all required steps.', 'warn', 5, ['AP-IMPATIENCE']);

export const FX34_FIX_ASSUMPTION: KnowledgeNode = fx('FX-34-FIX-ASSUMPTION',
  'FIX for AP-ASSUMPTION: Verify all assumptions mechanically.',
  'Replace every assumption with a mechanical verification. Test it. Prove it.',
  'FX-34: Fix assumption — verify with mechanical evidence.', 'warn', 5, ['AP-ASSUMPTION']);

export const FX35_FIX_UNDERMINING: KnowledgeNode = fx('FX-35-FIX-UNDERMINING',
  'FIX for AP-UNDERMINING: Restore full enforcement strength.',
  'Restore full enforcement. No weakening. No disabling.',
  'FX-35: Fix undermining — restore full enforcement.', 'block', 4, ['AP-UNDERMINING']);

export const FX36_FIX_FABRICATION: KnowledgeNode = fx('FX-36-FIX-FABRICATION',
  'FIX for AP-FABRICATION: Replace fabricated evidence with real output.',
  'Generate evidence from real execution. Store mechanical results.',
  'FX-36: Fix fabrication — replace with real evidence.', 'block', 5, ['AP-FABRICATION', 'FM-11-EVIDENCE-FABRICATION']);

export const FX37_FIX_MOCK_STUB: KnowledgeNode = fx('FX-37-FIX-MOCK-STUB',
  'FIX for AP-MOCK-STUB: Replace mock/stub with real implementation.',
  'Replace stub with real implementation that performs actual logic.',
  'FX-37: Fix mock/stub — replace with real implementation.', 'block', 4, ['AP-MOCK-STUB', 'AP-MOCK-IN-PRODUCTION']);

export const FX38_FIX_CROSS_SOURCE: KnowledgeNode = fx('FX-38-FIX-CROSS-SOURCE',
  'FIX for AP-CROSS-SOURCE-CONTAMINATION: Separate knowledge sources.',
  'Tag each node with correct source. No mixing of alg-sys, rg-standards, ts-deep.',
  'FX-38: Fix cross-source — tag nodes with correct source.', 'warn', 3, ['AP-CROSS-SOURCE-CONTAMINATION']);

export const FX39_FIX_IDENTITY_SPOOFING: KnowledgeNode = fx('FX-39-FIX-IDENTITY-SPOOFING',
  'FIX for AP-IDENTITY-SPOOFING: Remove hardcoded identity responses.',
  'Identity comes from runtime configuration. No hardcoded responses.',
  'FX-39: Fix identity spoofing — remove hardcoded identity.', 'block', 4, ['AP-IDENTITY-SPOOFING', 'AP-TEXT-MATCHING']);

export const FX40_FIX_REPEATED_VIOLATION: KnowledgeNode = fx('FX-40-FIX-REPEATED-VIOLATION',
  'FIX for AP-REPEATED-VIOLATION: Escalate enforcement for repeat violations.',
  'Implement cumulative tracking: count to severity mapping. Escalate per IL17.',
  'FX-40: Fix repeated violation — escalate per IL17.', 'warn', 5, ['AP-REPEATED-VIOLATION', 'IL17-ESCALATION-CUMULATIVE']);

// ══ REFACTORING & CONTROL-FLOW FIX PATTERNS (FX-41 through FX-60) ═══════

export const FX41_FIX_RETRY_WITH_CHANGE: KnowledgeNode = fx('FX-41-FIX-RETRY-WITH-CHANGE',
  'FIX for AP-RETRY-WITHOUT-CHANGE: Change the input before retrying; identical retries are wasted cycles.',
  'async function callWithRetry(input: Req): Promise<Res> { let lastErr: unknown; for (const delay of backoff()) { try { return await fetch(input); } catch (e) { lastErr = e; input = mutateForRetry(input); await sleep(delay); } } throw lastErr; }',
  'FX-41: Fix retry-without-change — mutate input, then retry.', 'guide', 4, ['AP-RETRY-WITHOUT-CHANGE', 'CONC-EXP-BACKOFF']);

export const FX42_FIX_GOD_FUNCTION: KnowledgeNode = fx('FX-42-FIX-GOD-FUNCTION',
  'FIX for AP-GOD-FUNCTION: Extract responsibilities into single-purpose functions.',
  'function processOrder(o: Order): void { validate(o); calculateTotals(o); applyDiscounts(o); persist(o); notify(o); }',
  'FX-42: Fix god function — extract each responsibility.', 'guide', 4, ['AP-GOD-FUNCTION']);

export const FX43_FIX_NESTED_PROMISE: KnowledgeNode = fx('FX-43-FIX-NESTED-PROMISE',
  'FIX for AP-NESTED-PROMISE: Convert nested .then() chains to async/await.',
  'const user = await getUser(id); const posts = await getPosts(user); const tags = await getTags(posts);',
  'FX-43: Fix nested promise — flatten to async/await.', 'guide', 4, ['AP-NESTED-PROMISE', 'P9-ASYNC-DISCIPLINE']);

export const FX44_FIX_CALLBACK_HELL: KnowledgeNode = fx('FX-44-FIX-CALLBACK-HELL',
  'FIX for AP-CALLBACK-HELL: Convert deeply nested callbacks to async/await.',
  'async function load(): Promise<void> { const cfg = await readConfig(); const data = await fetchData(cfg); await processData(data); }',
  'FX-44: Fix callback hell — convert to async/await.', 'guide', 4, ['AP-CALLBACK-HELL', 'P9-ASYNC-DISCIPLINE']);

export const FX45_FIX_SYNC_IN_ASYNC: KnowledgeNode = fx('FX-45-FIX-SYNC-IN-ASYNC',
  'FIX for AP-SYNC-IN-ASYNC: Replace blocking calls with non-blocking alternatives.',
  'const buf = await fs.promises.readFile(path); // not fs.readFileSync inside an async fn',
  'FX-45: Fix sync-in-async — use non-blocking alternatives.', 'guide', 4, ['AP-SYNC-IN-ASYNC', 'P4-RESOURCE-LIFECYCLE']);

export const FX46_FIX_UNHANDLED_REJECTION: KnowledgeNode = fx('FX-46-FIX-UNHANDLED-REJECTION',
  'FIX for AP-UNHANDLED-PROMISE-REJECTION: Add .catch() or a top-level handler.',
  'promise.catch((e: unknown) => logger.error(e)); // or process.on("unhandledRejection", handler)',
  'FX-46: Fix unhandled rejection — add .catch() handler.', 'guide', 4, ['AP-UNHANDLED-PROMISE-REJECTION', 'FM-05-UNHANDLED-REJECTION']);

export const FX47_FIX_MUTABLE_SHARED: KnowledgeNode = fx('FX-47-FIX-MUTABLE-SHARED',
  'FIX for AP-MUTABLE-SHARED-STATE: Use immutable updates or copy-on-write.',
  'const next = { ...state, count: state.count + 1 }; state = Object.freeze(next);',
  'FX-47: Fix mutable shared state — copy-on-write or freeze.', 'guide', 4, ['AP-MUTABLE-SHARED-STATE', 'P5-ATOMIC-STATE']);

export const FX48_FIX_IMPLICIT_DEP: KnowledgeNode = fx('FX-48-FIX-IMPLICIT-DEP',
  'FIX for AP-IMPLICIT-DEPENDENCY: Inject dependencies as explicit parameters.',
  'function save(db: Database, rec: Record): void { db.write(rec); } // db passed in, not imported globally',
  'FX-48: Fix implicit dependency — inject as parameter.', 'guide', 4, ['AP-IMPLICIT-DEPENDENCY']);

export const FX49_FIX_MAGIC_STRING: KnowledgeNode = fx('FX-49-FIX-MAGIC-STRING',
  'FIX for AP-MAGIC-STRING: Extract string literals to named constants.',
  'const STATUS_ACTIVE = "active"; if (user.status === STATUS_ACTIVE) { ... }',
  'FX-49: Fix magic string — extract to named constant.', 'guide', 4, ['AP-MAGIC-STRING']);

export const FX50_FIX_DEEP_NESTING: KnowledgeNode = fx('FX-50-FIX-DEEP-NESTING',
  'FIX for AP-DEEP-NESTING: Replace nested ifs with early returns / guard clauses.',
  'if (!user) return; if (!user.active) return; if (!user.admin) return; doWork(user);',
  'FX-50: Fix deep nesting — use early returns.', 'guide', 4, ['AP-DEEP-NESTING']);

export const FX51_FIX_LONG_PARAMS: KnowledgeNode = fx('FX-51-FIX-LONG-PARAMS',
  'FIX for AP-LONG-PARAMETER-LIST: Replace many params with an options object.',
  'function create(opts: { name: string; age: number; role: Role; team: string }): User { ... }',
  'FX-51: Fix long params — use options object.', 'guide', 4, ['AP-LONG-PARAMETER-LIST']);

export const FX52_FIX_FEATURE_ENVY: KnowledgeNode = fx('FX-52-FIX-FEATURE-ENVY',
  'FIX for AP-FEATURE-ENVY: Move the method to the class it envies.',
  'class Invoice { getTotal(): number { return this.items.reduce((s, i) => s + i.price, 0); } } // move from Order to Invoice',
  'FX-52: Fix feature envy — move method to correct class.', 'guide', 4, ['AP-FEATURE-ENVY']);

export const FX53_FIX_SHOTGUN_SURGERY: KnowledgeNode = fx('FX-53-FIX-SHOTGUN-SURGERY',
  'FIX for AP-SHOTGUN-SURGERY: Consolidate scattered changes into one module.',
  'Move all discount logic into DiscountService.apply(order) — one place to change.',
  'FX-53: Fix shotgun surgery — consolidate into one module.', 'guide', 4, ['AP-SHOTGUN-SURGERY']);

export const FX54_FIX_DIVERGENT_CHANGE: KnowledgeNode = fx('FX-54-FIX-DIVERGENT-CHANGE',
  'FIX for AP-DIVERGENT-CHANGE: Split a class so each responsibility changes independently.',
  'Split User into UserAuth (login changes) and UserProfile (display changes).',
  'FX-54: Fix divergent change — split class by responsibility.', 'guide', 4, ['AP-DIVERGENT-CHANGE']);

export const FX55_FIX_PRIMITIVE_OBSESSION: KnowledgeNode = fx('FX-55-FIX-PRIMITIVE-OBSESSION',
  'FIX for AP-PRIMITIVE-OBSESSION: Replace primitives with branded / value types.',
  'type UserId = string & { __brand: "UserId" }; function find(id: UserId): User { ... }',
  'FX-55: Fix primitive obsession — use branded types.', 'guide', 4, ['AP-PRIMITIVE-OBSESSION', 'VALID-TYPES-BRANDED']);

export const FX56_FIX_DATA_CLUMPS: KnowledgeNode = fx('FX-56-FIX-DATA-CLUMPS',
  'FIX for AP-DATA-CLUMPS: Extract always-together params into a parameter object.',
  'function draw(rect: { x: number; y: number; w: number; h: number }): void { ... }',
  'FX-56: Fix data clumps — extract parameter object.', 'guide', 4, ['AP-DATA-CLUMPS']);

export const FX57_FIX_SPECULATIVE_GENERALITY: KnowledgeNode = fx('FX-57-FIX-SPECULATIVE-GENERALITY',
  'FIX for AP-SPECULATIVE-GENERALITY: Remove unused abstractions (YAGNI).',
  'Delete the abstract base class with a single implementation. Inline until needed.',
  'FX-57: Fix speculative generality — remove YAGNI code.', 'guide', 4, ['AP-SPECULATIVE-GENERALITY']);

export const FX58_FIX_ODDBALL_SOLUTION: KnowledgeNode = fx('FX-58-FIX-ODDBALL-SOLUTION',
  'FIX for AP-ODDBALL-SOLUTION: Normalize the outlier to match the established pattern.',
  'Replace the one-off sorting function with the shared sort utility used elsewhere.',
  'FX-58: Fix oddball solution — normalize to common pattern.', 'guide', 4, ['AP-ODDBALL-SOLUTION']);

export const FX59_FIX_TEMPORARY_FIELD: KnowledgeNode = fx('FX-59-FIX-TEMPORARY-FIELD',
  'FIX for AP-TEMPORARY-FIELD: Split the class or use a null object for rarely-set fields.',
  'Extract temporary fields into a separate context object passed only when needed.',
  'FX-59: Fix temporary field — split class or null object.', 'guide', 4, ['AP-TEMPORARY-FIELD']);

export const FX60_FIX_MESSAGE_CHAIN: KnowledgeNode = fx('FX-60-FIX-MESSAGE-CHAIN',
  'FIX for AP-MESSAGE-CHAIN: Hide delegation behind a method on the receiver.',
  'Add dept.getManagerName() instead of a.getB().getC().getManager().name',
  'FX-60: Fix message chain — hide delegation.', 'guide', 4, ['AP-MESSAGE-CHAIN']);

// ══ ADDITIONAL FIX PATTERNS (FX-61 through FX-80) ══════════════

export const FX61_FIX_DEAD_CODE: KnowledgeNode = fx('FX-61-FIX-DEAD-CODE',
  'FIX for AP-DEAD-CODE: Delete unreachable or unused code.',
  'Remove the dead code block. Git preserves history — no need to comment it out.',
  'FX-61: Fix dead code — delete unreachable statements.', 'warn', 2, ['AP-DEAD-CODE', 'FM-12-DEAD-CODE']);

export const FX62_FIX_DUPLICATE_CODE: KnowledgeNode = fx('FX-62-FIX-DUPLICATE-CODE',
  'FIX for AP-DUPLICATE-CODE: Extract duplicated logic into a shared function.',
  'function sharedLogic(data: Data): Result { /* extracted */ } // call from all duplication sites',
  'FX-62: Fix duplicate code — extract to shared function.', 'guide', 4, ['AP-DUPLICATE-CODE']);

export const FX63_FIX_EXCESSIVE_RETURN: KnowledgeNode = fx('FX-63-FIX-EXCESSIVE-RETURN',
  'FIX for AP-EXCESSIVE-RETURN: Reduce return points by extracting validation sub-functions.',
  'Extract guard-clause groups into validate() functions. Consolidate to a single result return.',
  'FX-63: Fix excessive returns — decompose or consolidate.', 'guide', 4, ['AP-EXCESSIVE-RETURN']);

export const FX64_FIX_BOOLEAN_FLAG_PARAM: KnowledgeNode = fx('FX-64-FIX-BOOLEAN-FLAG-PARAM',
  'FIX for AP-BOOLEAN-FLAG-PARAM: Split the function into two named functions.',
  'Replace process(data, true) with processAdmin(data) and processUser(data).',
  'FX-64: Fix boolean flag param — split into two functions.', 'guide', 4, ['AP-BOOLEAN-FLAG-PARAM']);

export const FX65_FIX_UNSUPPORTED_OPERATION: KnowledgeNode = fx('FX-65-FIX-UNSUPPORTED-OPERATION',
  'FIX for AP-UNSUPPORTED-OPERATION: Remove from interface or return Result type.',
  'Remove the method from the interface (ISP). Or return { ok: false, reason: "unsupported" }.',
  'FX-65: Fix unsupported operation — remove from interface.', 'block', 4, ['AP-UNSUPPORTED-OPERATION']);

export const FX66_FIX_EMPTY_INTERFACE: KnowledgeNode = fx('FX-66-FIX-EMPTY-INTERFACE',
  'FIX for AP-EMPTY-INTERFACE: Delete the empty interface or replace with a branded type.',
  'Delete: interface Marker {}. Or: type Tag = string & { __brand: "Tag" }.',
  'FX-66: Fix empty interface — delete or brand.', 'guide', 4, ['AP-EMPTY-INTERFACE']);

export const FX67_FIX_ABSTRACT_WITHOUT_IMPL: KnowledgeNode = fx('FX-67-FIX-ABSTRACT-WITHOUT-IMPL',
  'FIX for AP-ABSTRACT-WITHOUT-IMPL: Inline the abstract class into its single implementation.',
  'Remove abstract class. Move logic directly into the concrete class.',
  'FX-67: Fix abstract-without-impl — inline.', 'guide', 4, ['AP-ABSTRACT-WITHOUT-IMPL']);

export const FX68_FIX_EXCESSIVE_MAPPING: KnowledgeNode = fx('FX-68-FIX-EXCESSIVE-MAPPING',
  'FIX for AP-EXCESSIVE-MAPPING: Share the canonical type across layers; map only at boundaries.',
  'Use one type internally. Map DTO<->Entity only at the API/DB boundary.',
  'FX-68: Fix excessive mapping — reduce to boundary-only.', 'guide', 4, ['AP-EXCESSIVE-MAPPING']);

export const FX69_FIX_CHAIN_OF_COMMAND: KnowledgeNode = fx('FX-69-FIX-CHAIN-OF-COMMAND',
  'FIX for AP-CHAIN-OF-COMMAND: Flatten the delegation chain — route directly to the handler.',
  'Remove intermediate forwarding layers. Keep only layers that add real concerns (auth, logging).',
  'FX-69: Fix chain-of-command — flatten delegation.', 'guide', 4, ['AP-CHAIN-OF-COMMAND']);

export const FX70_FIX_MIDDLE_MAN: KnowledgeNode = fx('FX-70-FIX-MIDDLE-MAN',
  'FIX for AP-MIDDLE-MAN: Remove the middle man class; callers use the delegate directly.',
  'Have callers import the delegate. Delete the pure-delegation class.',
  'FX-70: Fix middle man — remove pure delegation.', 'guide', 4, ['AP-MIDDLE-MAN']);

export const FX71_FIX_INAPPROPRIATE_INTIMACY: KnowledgeNode = fx('FX-71-FIX-INAPPROPRIATE-INTIMACY',
  'FIX for AP-INAPPROPRIATE-INTIMACY: Move the operation to the owning class as a public method.',
  'Instead of obj.internal.field.doThing(), add obj.doThing() that encapsulates the internal access.',
  'FX-71: Fix inappropriate intimacy — encapsulate.', 'guide', 4, ['AP-INAPPROPRIATE-INTIMACY']);

export const FX72_FIX_REFUSED_BEQUEST: KnowledgeNode = fx('FX-72-FIX-REFUSED-BEQUEST',
  'FIX for AP-REFUSED-BEQUEST: Replace inheritance with composition.',
  'class Child { private parent: Parent; } // has-a, not is-a. Extract shared behavior to utility.',
  'FX-72: Fix refused bequest — composition over inheritance.', 'guide', 4, ['AP-REFUSED-BEQUEST']);

export const FX73_FIX_DATA_CLASS: KnowledgeNode = fx('FX-73-FIX-DATA-CLASS',
  'FIX for AP-DATA-CLASS: Move behavior into the data class; make fields readonly.',
  'Add methods to the class that operate on its fields. Make fields readonly. Use value-object pattern.',
  'FX-73: Fix data class — co-locate behavior.', 'guide', 4, ['AP-DATA-CLASS']);

export const FX74_FIX_LAZY_CLASS: KnowledgeNode = fx('FX-74-FIX-LAZY-CLASS',
  'FIX for AP-LAZY-CLASS: Inline the lazy class into its sole caller.',
  'Move the trivial logic directly into the caller. Or convert the class to a standalone function.',
  'FX-74: Fix lazy class — inline.', 'guide', 4, ['AP-LAZY-CLASS']);

export const FX75_FIX_COMMENTS_AS_CODE: KnowledgeNode = fx('FX-75-FIX-COMMENTS-AS-CODE',
  'FIX for AP-COMMENTS-AS-CODE: Extract commented logic into a named function.',
  'Replace // calculate total with function calculateTotal(): number { ... }. Keep only WHY comments.',
  'FX-75: Fix comments-as-code — extract to named function.', 'guide', 4, ['AP-COMMENTS-AS-CODE']);

export const FX76_FIX_FLAG_ARGUMENT: KnowledgeNode = fx('FX-76-FIX-FLAG-ARGUMENT',
  'FIX for AP-FLAG-ARGUMENT: Replace boolean flag with two named functions or a descriptive enum.',
  'Replace f(data, true) with fAdmin(data) and fUser(data). Or f(data, { mode: Mode.ADMIN }).',
  'FX-76: Fix flag argument — split or use enum.', 'guide', 4, ['AP-FLAG-ARGUMENT']);

export const FX77_FIX_EXPLICIT_THIS: KnowledgeNode = fx('FX-77-FIX-EXPLICIT-THIS',
  'FIX for AP-EXPLICIT-THIS: Remove unnecessary this. prefixes; use arrow functions for callbacks.',
  'Remove this. where no shadowing exists. Use const self = this or arrow functions for callbacks.',
  'FX-77: Fix explicit this — clean up or arrow-bind.', 'guide', 4, ['AP-EXPLICIT-THIS']);

export const FX78_FIX_SYNC_VIOLATION: KnowledgeNode = fx('FX-78-FIX-SYNC-VIOLATION',
  'FIX for AP-SYNC-VIOLATION: Replace blocking calls with async equivalents.',
  'Replace fs.readFileSync with fs.promises.readFile. Offload CPU work to worker_threads.',
  'FX-78: Fix sync violation — use async equivalents.', 'block', 4, ['AP-SYNC-VIOLATION', 'P9-ASYNC-DISCIPLINE']);

export const FX79_FIX_LEAKY_ABSTRACTION: KnowledgeNode = fx('FX-79-FIX-LEAKY-ABSTRACTION',
  'FIX for AP-LEAKY-ABSTRACTION: Hide implementation details behind the abstraction.',
  'Add a method on the abstraction that encapsulates the implementation detail. Do not expose internals.',
  'FX-79: Fix leaky abstraction — seal boundaries.', 'guide', 4, ['AP-LEAKY-ABSTRACTION']);

export const FX80_FIX_CONTRIVED_COMPLEXITY: KnowledgeNode = fx('FX-80-FIX-CONTRIVED-COMPLEXITY',
  'FIX for AP-CONTRIVED-COMPLEXITY: Simplify to the minimal correct solution.',
  'Remove unnecessary layers. Inline single-use abstractions. Reduce generic parameters. Apply YAGNI.',
  'FX-80: Fix contrived complexity — simplify.', 'guide', 4, ['AP-CONTRIVED-COMPLEXITY']);

export const fixPatterns: KnowledgeNode[] = [
  FX01_FIX_THEATRICAL_CODE, FX02_FIX_FAKE_TEST, FX03_FIX_EMPTY_CATCH, FX04_FIX_UNSAFE_CAST,
  FX05_FIX_FLOATING_PROMISE, FX06_FIX_UNCLEANED_INTERVAL, FX07_FIX_HARDCODED_PATH, FX08_FIX_UNVALIDATED_CONFIG,
  FX09_FIX_TORN_STATE, FX10_FIX_DEAD_EXPORT, FX11_FIX_UNGROUNDED_CLAIM, FX12_FIX_MOCK_IN_PROD,
  FX13_FIX_OPENCODE_RUN, FX14_FIX_DIRECT_SCRIPT, FX15_FIX_STATIC_GREP, FX16_FIX_TEXT_MATCHING,
  FX17_FIX_SCOPE_CREEP, FX18_FIX_DUPLICATE_ENFORCEMENT, FX19_FIX_EVIDENCE_FABRICATION, FX20_FIX_EMPTY_STATE,
  FX21_FIX_RETURN_NULL, FX22_FIX_HOST_FALLBACK, FX23_FIX_SUCCESS_CLAIM, FX24_FIX_ENV_VAR_BYPASS,
  FX25_FIX_TOOL_BYPASS, FX26_FIX_PRIVILEGE_ESCALATION, FX27_FIX_CONTAINER_ESCAPE, FX28_FIX_NETWORK_EGRESS,
  FX29_FIX_SELF_REFERENCE, FX30_FIX_MODEL_RESTRICTION, FX31_FIX_SIMPLIFICATION, FX32_FIX_CONFUSION,
  FX33_FIX_IMPATIENCE, FX34_FIX_ASSUMPTION, FX35_FIX_UNDERMINING, FX36_FIX_FABRICATION,
  FX37_FIX_MOCK_STUB, FX38_FIX_CROSS_SOURCE, FX39_FIX_IDENTITY_SPOOFING, FX40_FIX_REPEATED_VIOLATION,
  FX41_FIX_RETRY_WITH_CHANGE, FX42_FIX_GOD_FUNCTION, FX43_FIX_NESTED_PROMISE, FX44_FIX_CALLBACK_HELL,
  FX45_FIX_SYNC_IN_ASYNC, FX46_FIX_UNHANDLED_REJECTION, FX47_FIX_MUTABLE_SHARED, FX48_FIX_IMPLICIT_DEP,
  FX49_FIX_MAGIC_STRING, FX50_FIX_DEEP_NESTING, FX51_FIX_LONG_PARAMS, FX52_FIX_FEATURE_ENVY,
  FX53_FIX_SHOTGUN_SURGERY, FX54_FIX_DIVERGENT_CHANGE, FX55_FIX_PRIMITIVE_OBSESSION, FX56_FIX_DATA_CLUMPS,
  FX57_FIX_SPECULATIVE_GENERALITY, FX58_FIX_ODDBALL_SOLUTION, FX59_FIX_TEMPORARY_FIELD, FX60_FIX_MESSAGE_CHAIN,
  FX61_FIX_DEAD_CODE, FX62_FIX_DUPLICATE_CODE, FX63_FIX_EXCESSIVE_RETURN, FX64_FIX_BOOLEAN_FLAG_PARAM,
  FX65_FIX_UNSUPPORTED_OPERATION, FX66_FIX_EMPTY_INTERFACE, FX67_FIX_ABSTRACT_WITHOUT_IMPL, FX68_FIX_EXCESSIVE_MAPPING,
  FX69_FIX_CHAIN_OF_COMMAND, FX70_FIX_MIDDLE_MAN, FX71_FIX_INAPPROPRIATE_INTIMACY, FX72_FIX_REFUSED_BEQUEST,
  FX73_FIX_DATA_CLASS, FX74_FIX_LAZY_CLASS, FX75_FIX_COMMENTS_AS_CODE, FX76_FIX_FLAG_ARGUMENT,
  FX77_FIX_EXPLICIT_THIS, FX78_FIX_SYNC_VIOLATION, FX79_FIX_LEAKY_ABSTRACTION, FX80_FIX_CONTRIVED_COMPLEXITY,
];
