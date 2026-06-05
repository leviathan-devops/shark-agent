# DECISION_CHAIN.md

_Initialized by CompactionManager. Updated on each milestone._

## v4.9.8 Architecture Decisions (2026-06-02)

### Decision: Algorithmic Enforcement System (NOT regex)
- **Context**: v4.9.7.5 had regex-based theatrical detection (`/catch\s*\{\s*\}/` etc). This produces false positives on valid code (`catch { console.error(e); cleanup(); }`) and false negatives on theatrical code that wraps regex patterns.
- **Option A**: Keep regex, add more patterns — REJECTED (scaling problem, not a design problem)
- **Option B**: AST-based analysis via TypeScript compiler API — REJECTED (too heavy, zod v4 already breaks tsc)
- **Option C**: Structured algorithmic classification with context awareness — SELECTED
- **Rationale**: Each block of code is classified independently. Context determines whether a pattern is theatrical or valid. No false positives. No LLM calls. Deterministic.

### Decision: T1 Injectable Pattern (NOT identity text injection)
- **Context**: Previous approach was injecting large text blocks into the LLM system prompt via identity-header.ts. This burns context tokens and the LLM can ignore it.
- **Option A**: Bigger identity text — REJECTED (token burn, ignorable)
- **Option B**: Code enforcement only — REJECTED (loses planning context)
- **Option C**: T1 injectables as TypeScript modules — SELECTED
- **Rationale**: T1 injectables are structured data (TypeScript interfaces) loaded into brain state. They contain detectors/enforcement/escalation/fixPatterns. The planning brain uses them to plan correctly. The execution brain uses them to verify output. The system brain uses them to enforce. Zero token burn. Code-enforced.

### Decision: T2 Bibles via Hive (NOT bundled)
- **Context**: 4 bibles total 4200+ lines. Bundling them would bloat the plugin.
- **Resolution**: T1 injectables distill the rules. T2 bibles stay in Hive, accessible via shark-hive-context tool when deeper context needed.

### Decision: Reasoning Brain as T1 Cache (NOT execution or system)
- **Context**: All 3 brains need access to T1 rules. Which brain caches them?
- **Resolution**: Reasoning brain (P90) loads and caches. Feeds rules to execution + system via messenger. Reasoning is the "knowledge" brain — it owns context management. Execution and system are consumers.

### Decision: bun build (not tsc)
- **Context**: `tsc --noEmit` fails with ~80 errors from zod v4 type mismatch with `@opencode-ai/plugin`.
- **Resolution**: Use bun build (proven for all v4.9.x). Accept tsc type mismatch as known limitation.

### Decision: Identity Triple Injection (2026-06-03)
- **Context**: v4.9.7.5 had identity loaded but discarded (passed as `_sharkIdentityPrompt` to hooks). User reported identity "never actually activated."
- **Option A**: Only use hardcoded identity-header.ts — REJECTED (ignores file-based identity)
- **Option B**: Only use identity-loader.ts files — REJECTED (hardcoded header is more comprehensive)
- **Option C**: Triple injection — SELECTED
- **Resolution**: Identity injected via 3 paths: (1) config() callback instructions, (2) system.transform hardcoded header, (3) system.transform file-based identity from identity/shark/*.md

### Decision: Tool Wiring Audit (2026-06-03)
- **Context**: User reported v4.9.7.5 had "spider/kraken tools wired instead of shark tools"
- **Finding**: v4.9.8 does NOT have this issue. All 17 tools are `shark-*`. The `spider/kraken` references are in `CROSS_AGENT_TOOLS` blocklist (firewall pattern), NOT tool registrations.
- **Resolution**: No fix needed — correct by design.
