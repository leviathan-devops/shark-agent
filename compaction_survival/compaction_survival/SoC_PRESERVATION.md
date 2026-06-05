# Shark v4.9.8 — Stream of Consciousness Preservation

**Purpose:** First-principles reasoning, experiential insights, and problem-solving patterns that must survive compactions.

---

## Patterns Discovered

### Algorithmic Enforcement > Identity Text (v4.9.8)
- **Context:** V6-V7.5 defined EngineeringChecklist, RuntimeViolation, RuntimePattern as data structures. Identity text told the agent to follow P1-P12. But none of these were WIRED to enforce automatically. The agent could (and did) produce theatrical code because nothing in the code path stopped it.
- **Lesson:** If enforcement is text the LLM can ignore, it is not enforcement. Enforcement must be in CODE paths that the LLM CANNOT bypass. `autoScanGeneratedCode()` on every write_file is enforcement. "Please follow P3" in the system prompt is not.
- **Proof:** Container test — agent asked to write empty catch + unchecked `as` + floating promise. Agent REFUSED and cited P3, P2, L5.19. Valid code with proper handling passed immediately.
- **Fix Principle:** T1 injectables are TypeScript modules with detectors/enforcement/escalation/fixPatterns. They run in brain code, not in LLM context.

### Import = Wire (2026-06-03 Discovery)
- **Context:** `execution-brain.ts` imported `detectAllViolations` (P1-P12 only) but `blockTheatricalCode()` called `detectAllT1Violations` (all 61 detectors). The unimported function threw ReferenceError on every call. Caught silently. Returned `{blocked: false}`. Zero enforcement for ~50 of 61 detectors for the entire v4.9.8 lifetime.
- **Lesson:** A wrong import produces ZERO enforcement and ZERO errors. The catch block hides the failure. Every enforcement function must be verified at runtime, not just by bundle grep. Node import tests are NOT sufficient — only hook-level tests exercise the actual enforcement code path.
- **Fix Principle:** Every enforcement function must have a direct unit test that calls it and verifies the output. Bundle-level existence checks are not enough.

### Look-Before-Match Blindness (2026-06-03 Discovery)
- **Context:** P8 detector used `code.substring(cm.index, cm.index + 400)` — slices AFTER the config.port match. But `.listen(config.port)` has `.listen(` BEFORE `config.port`. The detector could never catch inline config usage.
- **Lesson:** When searching for API usage patterns, always check BOTH directions from the match position. The env var check in the same function already used `Math.max(0, index - 150)` — the config check should have done the same.
- **Fix Principle:** Any regex detector that needs context from both sides of a match must use `Math.max(0, pos - N)` for the start of the search window. Never start at the match position.

### Discarded Parameters (2026-06-03 Discovery)
- **Context:** `index.ts` called `getSharkIdentityPrompt()` and passed result to `createSharkHooks()` as `_sharkIdentityPrompt` (underscore prefix = TypeScript convention for unused). The hooks never touched it. File-based identity from `identity/shark/*.md` was only usable for "who are you" queries, never injected into system context.
- **Lesson:** Underscore-prefixed parameters are a code smell. If it's loaded but not used, either use it or don't load it. Triple-check that loaded data actually flows through to the output.
- **Fix Principle:** Every parameter passed to a constructor should be checked for actual usage in the receiving scope. `// used in X` comments for parameters that seem unused.

### Null Guard Blindness (2026-06-03 Discovery)
- **Context:** Three hooks (`chat.message`, `config`, `event`) crashed on `null` input. The opencode runtime can call hooks with null/undefined input during edge cases. No handler checked for null inputs.
- **Lesson:** Every hook MUST guard against null input at the first line. `if (!input) return;` is the minimum. The TypeScript type system does not prevent runtime null inputs.
- **Fix Principle:** First line of every hook handler: null guard. Second line: destructure/extract. This prevents "cannot read property X of null" crashes from propagating to the opencode runtime.

### Floating Promise Blindness (2026-06-03 Discovery)
- **Context:** The `tool.execute.after` wrapper in `hooks/index.ts` called `createGateHook(...)(input, output)` without `await` or error handling. When the inner async function threw, the orphaned rejected promise was an unhandled rejection.
- **Lesson:** ANY call to an async function must be awaited OR have `.catch()`. The outer wrapper must be `async` and `await` inner calls. A synchronous wrapper around async calls creates floating promises.
- **Fix Principle:** If a wrapper function calls async functions, it MUST be async itself: `'hook.name': async (i, o) => { await inner(i, o).catch(() => {}); }`.

### Regex Detection is Theatrical (v4.9.8)
- **Context:** `scanForTheatricalPatterns()` used `/catch\s*\{\s*\}/` to detect empty catch blocks. But `catch { console.error(e); cleanup(); }` also matched. False positives everywhere. The tool was theater — it flagged valid code and missed real theatrical code that used `catch(e) {}` with a single newline.
- **Lesson:** Regex cannot understand context. Semantic classification can. Classify each block independently. Check what's INSIDE the block, not just the pattern of the opening brace.
- **Fix Principle:** `classifyTheatricalCode()` — structured analysis, block-level classification, context-aware.

### Cross-System Data Contract Violation (V6 Pokemon Red)
- NPC dialogue defined as nested arrays, consumer expected flat strings. TypeError crash on every NPC interaction.
- **Lesson:** Data SHAPE at integration boundaries must be verified.
- **Fix Principle:** P11 — Cross-System Data Contracts.

### Coupled Data Inconsistency (V6 Pokemon Red)
- PCENTER map has door tiles at y=6 but exit warp checks y=5.
- **Lesson:** Never hardcode a value that depends on data defined elsewhere.
- **Fix Principle:** P12 — Coupled Data Consistency.

### Algorithmic Systems Pattern (2026-06-02)
- **Source:** `/Shared Workspace Context/Algorithmic Systems/`
- **Core thesis:** If a human can write a rule for it, write the rule. Reserve models for what rules literally cannot do.
- **Pipeline:** absorber → classifier → processor → synthesizer
- **Key patterns:** Bounded FIFO dedup, atomic state writes, time-based non-blocking intervals
- **Applied to:** T1 injectables use the classifier → processor pipeline. Violations are classified, then enforcement is processed.

---

## Things Learned

1. **Defined ≠ Wired.** V6-V7.5 defined 15+ enforcement functions. Zero were auto-triggered. Definition without wiring is theater.
2. **Regex ≠ Semantic.** Pattern matching on source code strings produces false positives. Structured classification with context awareness is the correct approach.
3. **Identity text is NOT enforcement.** The LLM can and will ignore system prompt instructions when under pressure. Code-enforced paths are the only reliable enforcement.
4. **T1 injectables solve the token problem.** Full bibles are 4200+ lines. T1 distillations are ~100-200 lines each. Cached at module level, zero runtime overhead.
5. **3 brains must coordinate.** Each brain has a role: Reasoning (knowledge), Execution (output), System (enforcement). Coordination via messenger, not shared state.
6. **Algorithmic-first by default.** If you can write a rule, write the rule. Reserve the LLM for what rules cannot do.
7. **"Compiles" is NOT "works."** Static verification found 0 of 5 Pokemon Red defects. Runtime testing found all 5.

---

## Problem Solving Approaches

1. **When enforcement doesn't work:** Check if it's CODE-enforced or TEXT-enforced. Text = ignorable. Code = inescapable.
2. **When false positives spike:** Replace regex with structured classification. Check context, not just patterns.
3. **When token burn is high:** Move knowledge to T1 injectables. Cache at module level. Point to T2 bibles for deep context.
4. **When brains don't coordinate:** Wire messenger calls in brain-concurrency.ts. Each loop must read messages AND send results.
5. **When theatrical code ships:** Trace the code path. Where should autoScan have caught it? Why didn't it fire? Wire the missing path.
