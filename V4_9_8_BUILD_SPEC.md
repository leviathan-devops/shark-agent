# SHARK v4.9.8 — BUILD SPEC

## Context Management Overhaul + Runtime-Grade Hardcoding

**Forked from:** v4.9.7.5 baseline (2026-06-02)
**Purpose:** Upgrade compaction/context systems to Manta v2.2 grade, hardcode runtime-grade enforcement into brains, eliminate theatrical code production

---

## What Changed in v4.9.8

### 1. Compaction Hook Upgraded (Manta v2.2 Pattern)
- **File:** `src/hooks/v4.1/compacting-hook.ts`
- Now pushes context into `output.context` array for post-compaction re-injection
- Saves session gate state to `.shark/sessions/{sessionID}/gate-state.json`
- Injects runtime-grade enforcement reminder into compaction output
- Manta pattern: both Shark's comprehensive state + Manta's context push

### 2. Version Bump
- All references updated from v4.9 to v4.9.8
- Identity header, index.ts, compacting hook, identity files

### 3. Identity Reinforcement
- Identity header now reads "SHARK v4.9.8"
- Compaction hook injects "RUNTIME-GRADE ENGINEERING is ABSOLUTE. Theatrical code is NOT PERMITTED." into post-compaction context

---

## What Still Needs Engineering (v4.9.9+)

### Phase A: Hardcode Runtime-Grade into Execution Brain
**File:** `src/shark/brains/execution-brain.ts`
- Add `autoScanGeneratedCode()` that automatically runs detectRuntimePatterns() on every file write
- Add `blockTheatricalCode()` that HARD-BLOCKS code generation containing:
  - Empty catch blocks
  - Unchecked type assertions
  - Floating promises
  - Partial implementations
- EngineeringChecklist should be EVALUATED automatically on every gate transition, not just checked for existence
- The check should be INESCAPABLE — if the file doesn't exist or has violations, gate advancement is PHYSICALLY IMPOSSIBLE

### Phase B: Hardcode Runtime-Grade into System Brain
**File:** `src/shark/brains/system-brain.ts`
- scanForTheatricalPatterns() should run automatically on every tool.execute.after, not just when explicitly called
- Gate evaluation should be HARD — a failed gate cannot be bypassed by the model
- Add `selfAudit()` method that compares generated code against the 3 runtime grade bibles

### Phase C: Wire 3 Hive Bibles as Mandatory Context
**Files to read and inject:**
1. `~/.local/share/opencode/hive-mind/kraken/context/RUNTIME_GRADE_ENGINEERING_BIBLE.md`
2. `~/.local/share/opencode/hive-mind/kraken/context/T2_TUI_TESTING_BIBLE.md`
3. `~/.local/share/opencode/hive-mind/kraken/context/TESTING_FRAMEWORK_ADVERSARIAL_PRESSURE.md`

**Injection point:** `system-transform-hook.ts` — pre-pend ALL THREE bibles to system context on EVERY transform
**Effect:** The model cannot "forget" runtime-grade standards because they're re-injected on every message

### Phase D: Shark Engineers Itself (Meta-Build)
- Use the built Shark v4.9.8 to implement Phases A-C
- Container test with shark-browser-test verifying the built code
- The meta-build proves the system works by using the system to build itself

---

## Build Verification

```bash
# 1. Build
cd {PROJECT} && bun build src/index.ts --outdir dist --target bun --format esm --bundle --external @opencode-ai/plugin --external zod

# 2. System check (17 tools)
bun -e "const m=await import('./dist/index.js'); const h=await m.default({directory:'/tmp'}); console.log('Tools:', Object.keys(h.tool).length)"

# 3. Container test
docker run -d --rm --name test-shark-v498 opencode-test-browser:1.0 ...
tmux + docker exec -it + opencode --agent shark

# 4. Browser test
shark-browser-test /path/to/output.html

# 5. Verify compaction context push
cat .shark/build-context.md
```

---

## Ship Package

**Location:** `/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Shark Agent/SHIP APPROVED/SHARK_v4.9.8_20260602_021157/`

**Contents:**
- `index.js` — Built bundle (0.36 MB, 81 modules, 17 tools)
- `src/` — Full TypeScript source
- `identity/` — Identity files (14.4KB)
- `CHANGELOG.md` — Changes from v4.9.7.5
- `BUILD_REPORT.md` — Architecture and stats
- `DEBUG_LOG.md` — Known issues and recovery
- `CHECKSUM.txt` — MD5 checksum
- `Dockerfile.browser` — Container image build

---

## Anti-Derailment Checklist

- [ ] Do NOT produce "good enough" code — runtime grade or nothing
- [ ] Do NOT count lines or verify syntax as proof of completion
- [ ] Do NOT ship without container browser test
- [ ] Do NOT skip the 3 hive bibles injection
- [ ] Do NOT bypass gate enforcement
- [ ] Do NOT treat "nearly working" as "working"
- [ ] Do NOT make excuses about model limitations or context size
- [ ] Use compaction survival — checkpoint after EVERY milestone
