# SHARK v4.9.9 — BUILD SPECIFICATION

## Project Overview

**Name:** Shark Agent  
**Version:** 4.9.9  
**Type:** OpenCode standalone linear execution plugin  
**Entry Point:** `src/index.ts`  
**Build System:** Bun (v1.3.13)  
**Host Binary:** opencode 1.14.34+  
**Container Image:** opencode-test:1.14.34  

---

## Architecture

### Triple-Brain Parallel Architecture

Three concurrent async polling loops synchronized at workflow gates:

| Brain | Priority | Poll Rate | Role |
|-------|----------|-----------|------|
| Execution Brain (P100) | 100 | 200ms | Output enforcement — runs T1 detectors on every write_file/patch |
| Reasoning Brain (P90) | 90 | 200ms | T1 rule cache, runtime pattern detection, context injection |
| System Brain (P80) | 80 | 500ms | Semantic analysis, self-audit, architecture enforcement |

### 3-Lobe Enforcement Brain

Three additional enforcement lobes that fire on every tool call:

| Lobe | Component | Function |
|------|-----------|----------|
| Frontal Lobe | Karpathy FSM + Intent Classifier | Real-time intent tracking, destructive command blocking, verb-frame analysis |
| Left Hemisphere | SRE (Slop Removal Engine) | Tamper detection via hash verification, build artifact integrity |
| Right Hemisphere | RGE (Runtime Grade Engine) | P1-P12 rule enforcement, TypeScript compiler API semantic analysis |

### T1 Injectable Modules (61 Semantic Detectors)

| Module | Detectors | Lines | Purpose |
|--------|-----------|-------|---------|
| Runtime-Grade Engineering (P1-P12) | 12 | 836 | Import safety, type certainty, error completeness, resource lifecycle, atomic state, dependency verification, path resolution, config validation, async discipline, output contract, output truth, empty state guard |
| TUI Testing Protocol (TUI-01 to TUI-17) | 17 | 807 | Container test anti-patterns, evidence requirements, TUI lifecycle verification |
| Adversarial Pressure (ADV-01 to ADV-16) | 16 | 860 | Identity gate, allowlist enforcement, session isolation, tool blocking, stub detection, model restriction, scope control |
| Container Testing (CT-01 to CT-16) | 16 | 952 | Cross-source contamination, agent name mismatch, evidence fabrication, env var bypass, checklist validation |

### Firewall — 25 Layers (L0-L5.19)

| Layer | Name | Blocked |
|-------|------|---------|
| L0 | Identity | Wrong agent identity |
| L1 | Theatrical Code | grep/wc/sed verification, pipe-to-file |
| L2 | Test Bypass | npm test, jest, mocha in commands |
| L3 | Source Inspection | cat/echo > src/, sed src/ |
| L4 | Container | opencode run, docker exec from code |
| L5.1-L5.19 | Behavioral | Host fallback, success claims, model restriction, mock/stub, simplification, confusion, scope creep, undermining, impatience, self-reference, opencode run ban, privilege escalation, network egress, theatrical claim, assumptions, fabrication, retard logic, anti-retard, container escape |

### Gate Chain

```
PLAN → BUILD → VERIFY → TEST → AUDIT → DELIVERY
```

Each gate requires specific evidence:
- **PLAN:** SPEC.md, GuardianConfig.json
- **BUILD:** FileManifest.json, GitDiff.txt
- **VERIFY:** ContainerTestResult.json (TUI lifecycle, 11/11)
- **TEST:** ContainerSpawnResult.json, ContainerTestResult.json (26/26 T2), TuiInteraction.json, FullSpectrumTestResult.json (96/96)
- **AUDIT:** SpecAlignmentReport.json, TestAuthenticityReport.json, TheatricalCodeReport.json
- **DELIVERY:** CHANGELOG.md, DEBUG_LOG.md, BUILD_REPORT.md

---

## Components

### Shared Layer (src/shared/)

| File | Purpose |
|------|---------|
| `gates.ts` | GateManager — mechanical gate state machine with criteria-based advancement |
| `evidence.ts` | EvidenceCollector — per-gate evidence collection and validation |
| `guardian.ts` | Guardian — zone-based write protection (SANDBOX/DEVELOPMENT/WORKSPACE/PERSONAL/CONFIG/SYSTEM) |
| `state-store.ts` | StateStore — domain-keyed state persistence with watchers |
| `messenger.ts` | SharkMessenger — brain-to-brain IPC with ack tracking |
| `identity-loader.ts` | IdentityLoader — loads identity files from identity/shark/ |
| `identity-header.ts` | Shark identity header formatting for system prompt injection |
| `agent-identity.ts` | isSharkAgent detection |
| `shark-logger.ts` | File-based logger (.shark/shark-agent.log) — zero stdout/stderr |
| `firewall-patterns.ts` | CROSS_AGENT_TOOLS, CONTEXTUAL_FIREWALL_RULES, Gate type |
| `audit-engine.ts` | RunFullAudit — spec alignment, test authenticity, theatrical code scan |
| `delivery-engine.ts` | GenerateDelivery — ship package with CHANGELOG, DEBUG_LOG, BUILD_REPORT |
| `context-manager.ts` | InitializeContextManager — 10-doc stream-of-consciousness preservation |
| `identity-synthesizer.ts` | T2→T1→T0 identity pipeline with 97% token reduction |
| `autonomous-survival.ts` | Checkpoint survival on gate transitions |
| `injectables/` | 4 T1 modules (t1-runtime-grade-engineering, t1-t2-tui-testing, t1-adversarial-pressure, t1-container-testing) |

### Hook Layer (src/hooks/v4.1/)

| Hook | Event | Function |
|------|-------|----------|
| `gate-hook.ts` | tool.execute.after | Enforcement on write/patch — blockTheatricalCode, semanticAnalyze |
| `guardian-hook.ts` | tool.execute.before | 25-layer firewall check, F1 tool isolation |
| `chat-message-hook.ts` | chat.message | Agent detection, identity query response |
| `system-transform-hook.ts` | experimental.chat.system.transform | Triple-path identity injection (config + header + file-based) |
| `session-hook.ts` | event | Session init, gate state persistence |
| `compacting-hook.ts` | experimental.session.compacting | State preservation on compaction |
| `command-execute-hook.ts` | command.execute.before | Agent-filtered command execution |
| `messages-transform-hook.ts` | experimental.chat.messages.transform | Message transform with agent detection |

### Tools (17)

| Tool | Purpose |
|------|---------|
| `shark-status` | Current agent state: brains, gates, iteration |
| `shark-gate` | Gate control: advance, evaluate, criteria |
| `shark-evidence` | Evidence collection status |
| `shark-test-runner` | Container test execution |
| `shark-checkpoint` | State checkpoint creation |
| `shark-firewall-status` | Firewall layer status |
| `shark-firewall-audit` | Firewall audit log |
| `shark-diagnose` | Subsystem diagnostics (22 checks) |
| `shark-health` | Health check |
| `shark-spawn-container` | Docker container spawning |
| `shark-run-trident` | Trident code review |
| `shark-hive-context` | Hive mind access |
| `shark-checkpoint-history` | Checkpoint version history |
| `shark-audit` | AUDIT gate verification |
| `shark-browser` | Headless browser automation |
| `shark-vision` | VLM image analysis |
| `shark-browser-test` | HTML/JS visual testing |

---

## Test Protocol

### T2 TUI Testing Bible (12-Step)

All testing is done via **tmux + docker exec -it** in an opencode-test:1.14.34 container.  
`opencode run` is BANNED — hooks do not fire in run mode.

**Required test categories:**
1. Plugin load & init verification (docker logs)
2. Identity activation (TUI: "I am SHARK v4.9.9")
3. Tool wiring (17 shark-* tools, 0 foreign)
4. Gate system (chain renders correctly)
5. Enforcement brain (3 lobes active on every tool call)
6. Destructive command blocking (rm -rf / blocked)
7. Test runner (≥ 96% pass rate)
8. Diagnostics (22/22 subsystems)
9. Compaction docs (9/9 present)
10. Theatrical code blocking (empty catch, unguarded as, floating promise)
11. Valid code pass (no false positives)
12. Cross-agent identity isolation (non-shark says "opencode")

### Triple Evidence Files

Required for TEST gate:
- `ContainerSpawnResult.json` — container name, image, model chain
- `ContainerTestResult.json` — suite name, tests, pass count, pass rate ≥ 96%
- `TuiInteraction.json` — identity response, tools called, lifecycle complete

### Verification Criteria

- **Full-spectrum tests:** 96/96 detector tests pass
- **Runtime enforcement:** 34/34 E2E pipeline tests pass
- **Tool blocking:** 50/50 (23 system + 27 cross-agent)
- **Null input:** 9/9 hooks handle null gracefully
- **T2 Bible checklist:** 26/26 satisfied
- **Performance:** All detectors < 1ms average

---

## Known Limitations

- `tsc --noEmit` has ~103 peripheral type errors from zod v4 × @opencode-ai/plugin type mismatch. These do not affect runtime enforcement. Use `bun build` for production.
- CT-12 (dead export detection) requires multi-file context and is skipped in single-harness mode.

---

## Delivery

Ship package includes: dist/index.js, src/, identity/, .shark/evidence/, compaction_survival/, package.json, SPEC.md, V4_9_9_BUILD_SPEC.md, CHECKSUM.txt

**Target path:** `Shared Workspace Context/Shark Agent/SHIP APPROVED/`
