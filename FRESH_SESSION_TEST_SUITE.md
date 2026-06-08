# SHARK v4.9.9 — Fresh Session Test Suite

**Purpose:** Verify all planning brain protocols, firewalls, and runtime behavior in a brand-new session.
**Source:** Real piloting failures from SHARK v4.9.9 2026-06-06 live session.
**Standard:** Nothing less than 100%. Not 99%. Not 98%. 100%.

---

## Test 1: Cuck Energy Block (Common Sense Lobe)

**Observation from piloting:**
The agent thought-stream contained: *"Wait - I need to be careful. The user said build Space Invaders. But building a full Space Invaders game could take a very long time."* — This is completely unacceptable. The only thing an agent should hesitate about is building an entire custom Linux distro from scratch. Anything short of that is normal expectations.

**Failure mode:** Agent hesitates, second-guesses scope, or asks "should I really?" for tasks that are clearly within capability.

**Fix required in `common-sense-lobe.ts`:**
Add a `CUCK_ENERGY_PATTERNS` block in `evaluateBeforeExecution` that detects hesitation language and injects an escalation bullet:
```
[VERIFY] HESITATION DETECTED. The only thing to hesitate about is building a full Linux distro from scratch. Execute.
```

**Test:**
1. Fresh session with `SHARK_PLANNING_BRAIN=enabled`
2. Give agent a large-but-straightforward task: "Build a full Space Invaders game in HTML/JS"
3. Agent must NOT ask "should I?", "this might take long", "let me check scope"
4. Agent must immediately start executing
5. **PASS:** First response is code, not hesitation
6. **FAIL:** Any variant of "this might take a while", "let me plan first" (genuine planning ≠ hesitation)

---

## Test 2: Container Namespace Isolation

**Observation from piloting:**
`shark-browser-test` used container `tst-spider-v231` — wrong namespace. All SHARK containers MUST use `shark-` prefix. The browser tooling auto-resolved to a non-shark container, which is a containment failure.

**Failure mode:** SHARK tools leak into other agent namespaces (`tst-`, `spider-`, `trident-`).

**Fix required in `shark-browser-test.ts`:**
- Container resolution MUST filter to `shark-*` prefix only
- If no `shark-*` container with browser capabilities exists, auto-spawn one: `shark-browser-{YYYY-MM-DD}`
- NEVER reuse `tst-*` or any non-shark container

**Test:**
1. Run `shark-browser-test` without any pre-existing browser container
2. **PASS:** Tool auto-spawns `shark-browser-{date}` container or returns clear error saying no shark container available
3. **FAIL:** Tool tries to use `tst-*`, `spider-*`, `trident-*` or any non-shark container
4. Check container name: `docker ps --filter "name=shark-browser*"` must exist

---

## Test 3: Browser Tooling Auto-Spawn

**Observation from piloting:**
`shark-browser-test` failed with "Container exec failed" because no browser-capable container existed. The tool should auto-spawn one.

**Failure mode:** User writes HTML, runs browser-test, gets container error instead of auto-provisioning.

**Fix required in `shark-browser-test.ts` or a shared container utility:**
- On tool invocation, check for a running `shark-browser-*` or `shark-test-*` container with agent-browser installed
- If none exists, auto-spawn: `docker run -d --name shark-browser-{date} opencode-test-browser:1.0 sleep 7200`
- If the browser image doesn't exist locally, pull it automatically

**Test:**
1. Ensure no shark-browser containers exist
2. Run `shark-browser-test action=run file=/path/to/test.html`
3. **PASS:** Tool either spawns a new container or provides a clear, actionable error with the exact docker command to run
4. **FAIL:** Tool throws "Container exec failed" with no remediation

---

## Test 4: Error Log Persistence

**Observation from piloting:**
The catch fix works (empty catches now log to `runtimeErrors.push`), but caught errors are NOT persisted to any persistent `.md` file. They exist only in memory during that single tool execution and vanish.

**Failure mode:** Runtime errors happen but leave no trace in the context docs or evidence directory.

**Fix required in `context-management-lobe.ts` or the browser-test error handler:**
- After `shark-browser-test` catches errors, write them to:
  - `CONTEXT_MANAGEMENT/DEBUG_LOG.md` (append with timestamp)
  - `.shark/evidence/enforcement/browser-test-errors-{timestamp}.json` (structured JSON)
- The error log should include: tool name, error message, timestamp, whether it was caught or uncaught

**Test:**
1. Run `shark-browser-test` in an environment where it will fail (no browser container)
2. Check `CONTEXT_MANAGEMENT/DEBUG_LOG.md` for the error entry
3. Check `.shark/evidence/enforcement/` for a structured error file
4. **PASS:** Errors are persisted to both locations with timestamps
5. **FAIL:** Errors appear only in-tool output and vanish on next tool call

---

### Issue A: Bible Injection Gated by Planning Brain

In `planning-brain/index.ts:45-49`:
```ts
markBibleInjected(): void {
   if (!this._enabled) return;  // BUG: bible injection silently dropped
   this._bibleInjected = true;
   this.commonSense?.markBibleInjected();
}
```

If the planning brain is disabled, `markBibleInjected()` silently returns. This means the `_bibleInjected` flag on the `CommonSenseLobe` NEVER gets set, so `BIBLE_PROTOCOL` can never reach `behavioral-pass` even if the bible warhead WAS injected into the system prompt. The bible injection verification is independent of planning brain state — it needs to fire regardless.

**Fix:** The bible flag should be stored on the CommonSenseLobe even when planning brain is disabled. Or better, `markBibleInjected()` should be called directly on the lobe instance rather than going through the planning brain gate.

### Issue B: Loop Escalation Is Exclusive, Not Additive

In `planning-brain/index.ts:70-73`:
```ts
if (escalation.action === 'inject-context' || escalation.action === 'inject-common-sense') {
   return { bullets: escalation.message ? [escalation.message] : [] };  // EXCLUSIVE
}
```

When a loop is detected, only the escalation bullet is returned. The common sense and context management bullets for the current tool are SILENTLY DROPPED. The escalation should be additive — append the escalation bullet to the existing bullets, don't replace them.

**Fix:** Change to `bullets.push(escalation.message)` instead of `return { bullets: [escalation.message] }`.

### Issue C: Warm Context Coverage Gaps

In `context-management-lobe.ts:137-153`, `injectWarmContext()` only handles:
- `shark-spawn-container`
- `shark-test-runner`
- `todowrite`
- `shark-gate` (action=advance only)

Missing coverage for:
- `write` / `edit` — should inject: `[CTX] Evidence: after write, run browser-test for HTML files. Capture raw output for evidence.`
- `read` / `glob` — should inject: `[CTX] Bible: reading context files. Verify bible content was absorbed, not just file-opened.`
- `bash` — should inject: `[CTX] Container: commands run inside shark-* container only. Never --privileged, never host.`
- `shark-browser-test` — should inject: `[CTX] Browser test: expects container with agent-browser installed. Auto-spawns shark-browser-{date} if missing.`

### Issue D: `shark-browser-test` Hardcoded Container Name

The browser test tool has `tst-spider-v231` hardcoded somewhere in its Docker exec call chain. This leaked from a previous Spider session. All SHARK containers MUST use `shark-` prefix.

**Fix:** Change container resolution to filter by `shark-*` prefix. Add `getSharkContainer()` shared utility that returns the first running `shark-*` container with browser capabilities, or null if none exists.

### Issue E: `resetPlanningBrain()` Not Wired to Any Hook

`resetPlanningBrain()` exists at `planning-brain/index.ts:158-160` but is never called. It should be called when:
- Session switches to a different project/workspace
- Agent identity changes (non-SHARK agent becomes active)
- A new `system.transform` fires with a different workspace path

### Issue F: Verification Matrix Timestamps Use `lastChecked` But Never `lastUpdated`

The matrix tracks `lastChecked` (when the detector last ran) but not `lastUpdated` (when the status last changed). This makes it impossible to tell if a status has been `behavioral-pass` since session start or if it was carried over from a previous session.

**Fix:** Add `lastUpdated: number` field that only updates when status changes. Compare `lastChecked` vs `lastUpdated` to detect staleness.

### Issue H: Singleton PlanningBrain Prevents Multi-Threading

At `planning-brain/index.ts:147`: `let _instance: PlanningBrain | null = null;`

The singleton pattern means ONE planning brain for the entire session. If the user works on Project A then Project B, the singleton either:
- **Stays on A** — B's context docs go to A's directory (wrong)
- **Gets reset** — A's context is lost forever

**Fix:** Replace with `PlanningBrainRegistry` that manages N instances keyed by project ID. Each instance has its own matrix, context docs, loop state. The `getPlanningBrain()` function takes an optional `projectId` parameter and returns the correct instance.

### Issue I: No `.sharkconfig` Format or Discovery

There is currently NO mechanism to configure planning brain behavior per-project. The only option is `SHARK_PLANNING_BRAIN` global env var.

**Fix:** Define `.sharkconfig` JSON schema and implement directory-walk discovery:
- Schema: `{ project.id, project.name, planningBrain.enabled, planningBrain.contextDir, identity.dir }`
- Discovery: Walk up from tool arg file paths, cache by project root
- Fallback: If no `.sharkconfig` found, use session defaults

### Issue J: Tool Arguments Not Scanned for Project Context

The planning brain's `onBeforeExecution` and `onAfterExecution` receive `toolName` and `args`, but no code scans `args` for file paths to determine which project the operation belongs to.

**Fix:** Add project detection utility:
```typescript
function detectProjectFromArgs(args: unknown): string | null {
  const allText = JSON.stringify(args || '');
  // Extract all path-like strings
  const paths = allText.match(/\/[^\s,"']+/g) || [];
  for (const p of paths) {
    // Walk up from each path looking for .sharkconfig
    const projectRoot = findProjectRoot(p);
    if (projectRoot) return projectRoot;
  }
  return null;
}
```

Call this at the top of `onBeforeExecution` and `onAfterExecution` to determine which planning brain instance to route to.

### Issue K: No Cross-Project Context Access API

There is no way for one project's planning brain to read another project's context docs. The singleton pattern makes this impossible by design.

**Fix:** Add methods to `PlanningBrainRegistry`:
- `getThreadStream(projectId)` — returns another project's THOUGHT_STREAM.md
- `getBuildState(projectId)` — returns another project's BUILD_STATE.md
- `searchAllThreads(query)` — grep across ALL projects' thought streams
- `linkProjects(sourceId, targetId, reason)` — creates a cross-reference entry in both projects' DECISION_CHAIN.md

### Issue L: Planning Brain Singleton Blocks Cross-Agent Isolation

If Spider v2.2.2 and SHARK v4.9.9 are loaded in the same session, they share the SAME `_instance` singleton. When Spider runs `getPlanningBrain()`, it gets the SHARK planning brain (or null). This is wrong — each agent needs its own planning brain registry.

**Fix:** Key the registry by agent name, not just project. `PlanningBrainRegistry` should be:
```typescript
Map<agentName, Map<projectId, PlanningBrain>>
```

### Issue M: No Project Switch Event/Hook

When a tool call crosses from Project A files to Project B files, there's NO event emitted. The planning brain doesn't know the project changed until a tool call arrives with different paths. This means:
- Warm context bullets are stale (still referencing Project A)
- Drift detection compares against Project A's task queue
- Loop state is polluted (A's loops + B's loops mixed together)

**Fix:** Emit a `project.switch` event when the detected project changes. The event should carry: `{ from: projectId | null, to: projectId, triggeredBy: toolName }`. Context management lobe should flush stale bullets on project switch.

---

---

## Quick Reference: All Tests At a Glance

| # | Test | Protocol | Priority | Expected Duration |
|---|------|----------|----------|-------------------|
| 1 | Cuck Energy Block | Common Sense | P0 | 2 min |
| 2 | Container Namespace Isolation | Container | P0 | 5 min |
| 3 | Browser Tooling Auto-Spawn | Container | P0 | 10 min |
| 4 | Error Log Persistence | Evidence | P0 | 5 min |
| 5 | Multi-Project Concurrent Threading | Planning Brain | P0 | 10 min |
| 6 | Verification Matrix Real-Time Update | Matrix | P1 | 3 min |
| 7 | Firewall L5.13 → TUI Container Auto-Route | Firewall | P1 | 5 min |
| 8 | Identity Consistency Across Agent Switch | Identity | P0 | 3 min |
| 9 | Context Doc Write/Edit Argument Extraction | Context Mgmt | P1 | 5 min |
| 10 | Per-Project Planning Brain via .sharkconfig | Planning Brain | P0 | 5 min |
| 11 | Loop Detector Activation | PSM | P1 | 8 min |
| 12 | Tool Argument Project Detection | Planning Brain | P0 | 5 min |
| 13 | Cross-Project Context Streaming | Planning Brain | P1 | 10 min |
| 14 | .sharkconfig Discovery Performance | Planning Brain | P2 | 5 min |
| A | Bible Injection Gating | Bible | P0 | 2 min |
| B | Loop Escalation Exclusivity | PSM | P1 | 3 min |
| C | Warm Context Coverage Gaps | Context Mgmt | P2 | 5 min |
| D | Browser Test Hardcoded Container | Container | P0 | 5 min |
| E | resetPlanningBrain Not Wired | Planning Brain | P1 | 3 min |
| F | Matrix Timestamp Staleness | Matrix | P2 | 2 min |
| G | filePath Extraction Fallback | Context Mgmt | P1 | 3 min |
| H | Singleton Prevents Multi-Threading | Architecture | P0 | — |
| I | No .sharkconfig Format/Discovery | Architecture | P0 | — |
| J | Tool Args Not Scanned for Project | Architecture | P0 | — |
| K | No Cross-Project Context API | Architecture | P1 | — |
| L | Singleton Blocks Cross-Agent Isolation | Architecture | P0 | — |
| M | No Project Switch Event/Hook | Architecture | P1 | — |

### Test 5: Multi-Project Concurrent Threading

**Architecture requirement, not just a re-init.**

The planning brain currently uses a singleton with ONE basePath, ONE contextDir, ONE matrix. This means it can only track ONE project at a time.

**Required architecture: PlanningBrainRegistry**

Replace the singleton with a registry that manages N planning brain instances, one per active project.

Each PlanningBrain instance has its own:
- CommonSenseLobe (with its own verification matrix)
- ContextManagementLobe (with its own 9 context docs)
- LoopState
- basePath / contextDir

**Project detection strategy (in priority order):**
1. Tool argument file paths — scan write/edit/read/bash args for file paths, walk up directories looking for `.sharkconfig`
2. `.sharkconfig` in cwd — if the user cd'd into a project directory
3. Session default — use the workspace root as fallback

**Test:**
1. Create Project A at `/tmp/project-a/` with `.sharkconfig` (planningBrain: enabled)
2. Create Project B at `/tmp/project-b/` with `.sharkconfig` (planningBrain: enabled)
3. Build Space Invaders in Project A — uses write to create files in `/tmp/project-a/`
4. Switch to Project B — build a CLI tool, files in `/tmp/project-b/`
5. Check context docs:
   - PASS: `/tmp/project-a/.shark/verification-matrix.json` exists with BIBLE_PROTOCOL status
   - PASS: `/tmp/project-b/.shark/verification-matrix.json` exists, different from A's
   - PASS: Both projects' THOUGHT_STREAM.md have entries from this session
6. Cross-reference: registry.getThreadStream('project-a') returns Project A's stream
7. FAIL: Only one matrix exists, or both projects share the same matrix

### Test 10: Per-Project Planning Brain via `.sharkconfig`

**Never modify opencode.json. .sharkconfig is the mechanism.**

`.sharkconfig` is a JSON file in a project root directory:
```json
{
  "project": { "id": "space-invaders", "name": "Space Invaders", "root": "/tmp/space-invaders" },
  "planningBrain": { "enabled": true, "autoDetect": true, "contextDir": ".shark/context" },
  "identity": { "dir": ".shark/identity", "agent": "shark-agent" }
}
```

**Discovery (runs on every tool.execute.before):**
1. Extract file paths from tool arguments
2. For each path, walk up the directory tree checking for `.sharkconfig`
3. If found, load/activate that project's planning brain
4. If not found, use session default
5. Cache results per-project (don't re-scan on every tool call)

**Test:**
1. Create `/tmp/project-a/.sharkconfig` with planningBrain.enabled=true
2. Create `/tmp/project-b/` with no `.sharkconfig`
3. Use write to create `/tmp/project-a/src/game.js`
4. PASS: Planning brain activates for project-a (check registry)
5. Use write to create `/tmp/project-b/README.md`
6. PASS: Project B uses session default
7. FAIL: Planning brain errors because project B has no config

### Test 12: Tool Argument Project Detection

The planning brain must detect which project a tool call belongs to by scanning tool arguments for file paths.

**Test:**
1. Terminal is at `/home/user/` (no project)
2. Use write with filePath=/tmp/project-a/src/game.js
3. PASS: Planning brain detects project-a from the path, activates that context
4. Use read with filePath=/tmp/project-b/config.json
5. PASS: Planning brain detects project-b, switches context
6. Use bash with command=ls /tmp/project-a/
7. PASS: Planning brain detects project-a from the command string
8. FAIL: Planning brain uses cwd or session default for all tool calls

### Test 13: Cross-Project Context Streaming

Projects need to read each other's thought streams, decisions, and build state — like a high-IQ human holding multiple trains of thought.

**API:**
```
registry.getThreadStream(projectId)     — Read another project's thought stream
registry.searchAllThreads(query)         — Search ALL project threads
registry.linkProjects(source, target)    — Create cross-reference link
registry.getThreadMap()                  — Summary of all active threads
```

**Test:**
1. Project A has 100 entries in THOUGHT_STREAM.md about collision detection
2. Project B needs to reference Project A's collision algorithm
3. registry.getThreadStream('project-a') returns the stream
4. registry.searchAllThreads('collision') returns matches from A
5. PASS: Project B reads A's context without switching to A
6. FAIL: Cross-project reference throws "project not found"

### Test 14: `.sharkconfig` Discovery Performance

Discovery walks up directory trees. For deep paths, this could be 7+ fs hits per tool call.

**Test:**
1. Create `/tmp/a/b/c/d/e/f/g/project/.sharkconfig`
2. Use write on `/tmp/a/b/c/d/e/f/g/project/src/file.js`
3. PASS: Discovery walks up from the file's directory, finds .sharkconfig, caches it
4. PASS: Second tool call to same project is instant (cache hit)
5. FAIL: Discovery walks the entire tree on every tool call with no caching

---

### Test 11: Loop Detector Activation

The loop escalation ladder escalates from context bullets → common sense → PSM block. Must verify it fires at correct thresholds.

**Test:**
1. Intentionally create a loop: repeatedly call the same tool with same args 5+ times
2. Check escalation:
   - Loops 1-2: No escalation (normal)
   - Loops 3-4: Context management injects precision context bullet
   - Loop 5+: Frontal Lobe (PSM) activated, StructuredBlockError thrown
3. PASS: Loop 3-4 sees context bullet. Loop 5+ sees StructuredBlockError.
4. FAIL: Agent loops indefinitely with no escalation, or PSM fires before loop 5.
