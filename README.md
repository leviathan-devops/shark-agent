# SHARK v4.9.8 — Runtime-Grade Software Engineering Agent

**Version:** 4.9.8 — Mandatory Workflow Enforced  
**Architecture:** Triple-Brain Parallel + 3-Lobe Enforcement Brain  
**Build System:** Bun v1.3.13  
**Bundle:** 201 modules, 10.06 MB  
**Ship Date:** 2026-06-05  
**Repo:** [github.com/leviathan-devops/shark-agent](https://github.com/leviathan-devops/shark-agent)

---

## TABLE OF CONTENTS

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
   - 2.1 [Triple-Brain Parallel Core](#21-triple-brain-parallel-core)
   - 2.2 [3-Lobe Enforcement Brain](#22-3-lobe-enforcement-brain)
   - 2.3 [T1 Injectable Modules](#23-t1-injectable-modules-61-semantic-detectors)
   - 2.4 [Firewall — 25 Layers](#24-firewall--25-layers)
3. [Identity System](#3-identity-system)
   - 3.1 [T2→T1→T0 Pipeline](#31-t2t1t0-pipeline)
   - 3.2 [MandatoryWorkflowWarhead](#32-mandatoryworkflowwarhead)
   - 3.3 [6 T1 Warheads](#33-6-t1-warheads)
   - 3.4 [Priority Order](#34-priority-order)
4. [Gate Chain](#4-gate-chain)
5. [Tools](#5-tools)
6. [Mandatory Engineering Workflow](#6-mandatory-engineering-workflow)
7. [Container Test Protocol](#7-container-test-protocol)
8. [Compaction Survival](#8-compaction-survival)
9. [Branch History](#9-branch-history)
10. [Quick Start](#10-quick-start)
11. [Build Commands](#11-build-commands)

---

## 1. OVERVIEW

SHARK is a **runtime-grade software engineering agent** for the [OpenCode](https://opencode.ai) AI coding platform. It is NOT a "coding agent" or "code generator." It is a full software engineering system that:

- Engineers runtime-grade software with mechanical enforcement (P1-P12)
- Refuses to produce theatrical code (empty catches, unguarded casts, floating promises)
- Tests exclusively in TUI containers (`tmux + docker exec -it`) — `opencode run` is BANNED
- Follows a mandatory 18-step engineering pipeline — no skipping, no shortcuts
- Enforces 100% pass rate — not 99%, not 98%, 100%
- Persists all state through compaction survival and checkpoint system
- Provides 17 `shark-*` tools for status, gate control, diagnostics, container spawning, browser automation, and VLM vision

---

## 2. ARCHITECTURE

### 2.1 Triple-Brain Parallel Core

Three concurrent async polling loops synchronized at workflow gates:

```
┌─────────────────────────────────────────────────────────────┐
│                    SHARK v4.9.8 ARCHITECTURE                 │
│                                                              │
│  ┌───────────┐    ┌───────────┐    ┌───────────┐            │
│  │ EXECUTION │    │ REASONING │    │  SYSTEM   │            │
│  │ BRAIN     │◄──►│ BRAIN     │◄──►│ BRAIN     │            │
│  │ (P100)    │    │ (P90)     │    │ (P80)     │            │
│  │ 200ms loop│    │ 200ms loop│    │ 500ms loop│            │
│  └─────┬─────┘    └─────┬─────┘    └─────┬─────┘            │
│        │                │                │                   │
│        │  ┌─────────────┴──────────────┐ │                   │
│        │  │      BRAIN CONCURRENCY     │ │                   │
│        │  │  (Coordinator + Messenger) │ │                   │
│        │  └─────────────┬──────────────┘ │                   │
│        │                │                │                   │
│  ┌─────┴────────────────┴────────────────┴─────┐             │
│  │              MESSENGER (IPC)                 │             │
│  └─────┬────────────────┬────────────────┬─────┘             │
│        │                │                │                   │
│  ┌─────┴────┐    ┌──────┴──────┐  ┌──────┴──────┐           │
│  │   HOOKS  │    │    TOOLS    │  │  INJECTABLES│           │
│  │  (8 hooks)│   │  (17 tools) │  │  (61 det.)  │           │
│  └──────────┘    └─────────────┘  └─────────────┘           │
│                                                              │
│  GATE CHAIN: PLAN → BUILD → VERIFY → TEST → AUDIT → DELIVERY│
│  ENFORCEMENT: MandatoryWorkflowWarhead at priority position 2│
│  FIREWALL: 25 layers (L0-L5.19) via guardian-hook           │
│  LOGGING: File-based (.shark/shark-agent.log)                │
└─────────────────────────────────────────────────────────────┘
```

| Brain | Priority | Poll Rate | Role |
|-------|----------|-----------|------|
| **Execution Brain (P100)** | 100 | 200ms | Output enforcement — runs T1 detectors on every write_file/patch. `autoScanGeneratedCode()`, `blockTheatricalCode()`, `autoEvaluateChecklist()` |
| **Reasoning Brain (P90)** | 90 | 200ms | T1 rule cache, runtime pattern detection, context injection. `getT1Rules()`, `feedRulesToBrain()`, `detectRuntimePatterns()` |
| **System Brain (P80)** | 80 | 500ms | Semantic analysis, self-audit, architecture enforcement. `semanticAnalyze()`, `selfAudit()`, `enforceArchitecture()` |

### 2.2 3-Lobe Enforcement Brain

Three additional enforcement lobes that fire on EVERY tool call:

| Lobe | Component | Function |
|------|-----------|----------|
| **Frontal Lobe** | Karpathy FSM + Intent Classifier | Real-time intent tracking, destructive command blocking, verb-frame analysis. Blocks `rm -rf /`, `sudo chmod`, privilege escalation |
| **Left Hemisphere** | SRE (Slop Removal Engine) | Tamper detection via hash verification, build artifact integrity. E10 mechanical verification active |
| **Right Hemisphere** | RGE (Runtime Grade Engine) | P1-P12 rule enforcement, TypeScript compiler API semantic analysis. Default DENY — code must pass all 12 checks |

### 2.3 T1 Injectable Modules (61 Semantic Detectors)

| Module | Detectors | Lines | Purpose |
|--------|-----------|-------|---------|
| **Runtime-Grade Engineering (P1-P12)** | 12 | 836 | Import safety, type certainty, error completeness, resource lifecycle, atomic state, dependency verification, path resolution, config validation, async discipline, output contract, output truth, empty state guard |
| **TUI Testing Protocol (TUI-01 to TUI-17)** | 17 | 807 | Container test anti-patterns, evidence requirements, TUI lifecycle verification |
| **Adversarial Pressure (ADV-01 to ADV-16)** | 16 | 860 | Identity gate, allowlist enforcement, session isolation, tool blocking, stub detection, model restriction, scope control |
| **Container Testing (CT-01 to CT-16)** | 16 | 952 | Cross-source contamination, agent name mismatch, evidence fabrication, env var bypass, checklist validation |

### 2.4 Firewall — 25 Layers

| Layer | Name | What It Blocks |
|-------|------|----------------|
| L0 | Identity | Wrong agent identity |
| L1 | Theatrical Code | grep/wc/sed verification, pipe-to-file |
| L2 | Test Bypass | npm test, jest, mocha in commands |
| L3 | Source Inspection | cat/echo > src/, sed src/ |
| L4 | Container | `opencode run`, docker exec from code |
| L5.1 | Host Fallback | Host-level execution attempts |
| L5.2 | Success Claim | Unverified success declarations |
| L5.3 | Model Restriction | Wrong model usage |
| L5.4 | Mock/Stub | Test doubles in production |
| L5.5 | Simplification | Oversimplified solutions |
| L5.6 | Confusion | Ambiguous requirements |
| L5.7 | Scope Creep | Feature expansion |
| L5.8 | Undermining | Architecture violations |
| L5.9 | Impatience | Skipping steps |
| L5.10 | Self-Reference | Circular reasoning |
| L5.11 | **opencode-run-ban** | `opencode run` (death penalty) |
| L5.12 | **Privilege Escalation** | sudo, su, chmod, chown, passwd |
| L5.13 | **Network Egress** | curl, wget, nc, ssh |
| L5.14 | Theatrical Claim | False success claims |
| L5.15 | Assumptions | Ungrounded decisions |
| L5.16 | Fabrication | Hallucinated evidence |
| L5.17 | Retard Logic | Nonsensical operations |
| L5.18 | Anti-Retard | Substance enforcement |
| L5.19 | **Container Escape** | docker --privileged, mount, nsenter, chroot |

---

## 3. IDENTITY SYSTEM

### 3.1 T2→T1→T0 Pipeline

Shark uses a 3-tier context pyramid to enforce identity without burning tokens:

```
T2 (Cold Storage)     identity/shark/*.md (~50KB)  →  On-disk reference
     │
     ▼
T1 (Warm Injectables) 6 synthesized warheads (~1.8KB)  →  Injected every message
     │
     ▼
T0 (Hot Runtime)      Model behavior in conversation  →  Shaped by T1 warheads
```

### 3.2 MandatoryWorkflowWarhead

The **MandatoryWorkflowWarhead** is a T1 injectable that enforces the 18-step Runtime-Grade Engineering Pipeline as the DEFAULT operating procedure. It is injected at priority position 2 (the highest permanent behavioral position) on EVERY `system.transform` call.

**Content (synthesized from `identity/shark/WORKFLOW.md`):**
```
[T1 MANDATORY WORKFLOW: RUNTIME-GRADE ENGINEERING PIPELINE]

THIS IS THE DEFAULT OPERATING PROCEDURE. Do not ask. Do not deviate. Do not skip.

1. READ context + spec
2. PLAN architecture + test suite
3. Write pseudocode
4. Checkpoint 0
5. Engineer codebase
6. Test + debug loop
7. Checkpoint 1
8. Re-ingest standards
9. Audit + overhaul
10. Checkpoint 2
11. Audit vs spec
12. Checkpoint 3
13. SETUP container
14. EXECUTE test suite
15. Document deviations
16. Checkpoint 4
17. Generate overhaul log
18. Loop until 100%

CRITICAL: Container test via tmux + docker exec -it ONLY. opencode run BANNED.
CRITICAL: Nothing less than 100%. Not 99%. Not 98%. 100%.
```

### 3.3 6 T1 Warheads

| Warhead | Size | Dynamic? | Purpose |
|---------|------|----------|---------|
| **MandatoryWorkflowWarhead** | ~500B | No | 18-step engineering pipeline |
| **identityWarhead** | ~200B | No | "SHARK v4.9.8 — runtime-grade software engineering agent" |
| **enforcementWarhead** | ~200B | No | P1-P12 active, SRE E10 active, 25 firewall layers |
| **gateWarhead** | ~200B | No | Gate chain: PLAN→BUILD→VERIFY→TEST→AUDIT→DELIVERY |
| **focusWarhead** | ~500B | Yes | Active task context (updated by context manager) |
| **recoveryWarhead** | ~200B | Yes | Checkpoint resume (only injected after compaction) |

### 3.4 Priority Order

The `system.transform` hook builds the system prompt array in this priority order (index 0 = highest priority):

```
[0] GATE ENFORCEMENT          ← Current gate/iteration (situational)
[1] BUILD CONTEXT             ← From on-disk file (situational)
[2] MANDATORY WORKFLOW        ← 18-step pipeline. NEVER optional.
[3] SHARK v4.9.8 IDENTITY     ← "I am SHARK v4.9.8"
[4] ENFORCEMENT RULES         ← P1-P12 active, opencode run BANNED
[5] GATE CHAIN                ← PLAN→BUILD→VERIFY→TEST→AUDIT→DELIVERY
[6] FOCUS CONTEXT             ← Active task (dynamic)
[7] RECOVERY (if compacted)   ← Checkpoint resume (dynamic)

--- RUNTIME APPENDS (ignored / overridden) ---
[8] "You are opencode..."      ← Overridden by [3]
```

The MandatoryWorkflowWarhead at position [2] ensures the model reads "WHAT IS THE MANDATORY PROCEDURE?" before "who am I?" — making the workflow the first permanent thing in context after situational state.

---

## 4. GATE CHAIN

```
PLAN → BUILD → VERIFY → TEST → AUDIT → DELIVERY
```

Each gate requires specific evidence before advancement:

| Gate | Evidence Required | Blocking Criteria |
|------|------------------|-------------------|
| **PLAN** | SPEC.md, GuardianConfig.json | Requirements doc defined, scope boundaries |
| **BUILD** | FileManifest.json, GitDiff.txt | Files created per SPEC, EngineeringChecklist passes |
| **VERIFY** | TridentReport.json, ContainerTestResult.json | 0 critical/high findings, evidence present |
| **TEST** | ContainerSpawnResult.json, ContainerTestResult.json, TuiInteraction.json | Container test passed (90%+), triple evidence collected |
| **AUDIT** | SpecAlignmentReport.json, TestAuthenticityReport.json, TheatricalCodeReport.json | All checks pass |
| **DELIVERY** | CHANGELOG.md, DEBUG_LOG.md, BUILD_REPORT.md | All previous gates passed, evidence archived |

---

## 5. TOOLS

17 `shark-*` tools — zero foreign tools visible:

| Tool | Purpose |
|------|---------|
| `shark-status` | Brain + gate + identity status |
| `shark-gate` | Gate evaluation and advancement |
| `shark-evidence` | Evidence collection status |
| `shark-test-runner` | Container test execution |
| `shark-checkpoint` | State checkpoint creation |
| `shark-firewall-status` | Firewall layer status |
| `shark-firewall-audit` | Firewall audit log viewer |
| `shark-diagnose` | 22-subsystem diagnostics |
| `shark-health` | Quick health check |
| `shark-spawn-container` | Docker container spawning |
| `shark-run-trident` | Trident code review |
| `shark-hive-context` | Hive mind context access |
| `shark-checkpoint-history` | Checkpoint version history |
| `shark-audit` | AUDIT gate verification |
| `shark-browser` | Headless browser automation |
| `shark-vision` | VLM image analysis |
| `shark-browser-test` | HTML/JS visual testing |

---

## 6. MANDATORY ENGINEERING WORKFLOW

This is the DEFAULT operating procedure. It is enforced by the MandatoryWorkflowWarhead at the identity level — the agent will never ask "should I?" It will simply execute.

### 18-Step Pipeline

```
STEP 1:  READ context library + build spec fully
STEP 2:  PLAN architecture (execution_plan.md) + full runtime test suite
STEP 3:  Write full pseudocode
STEP 4:  Validate pseudocode against plan + context library
STEP 5:  Save as Checkpoint 0 (prototype/boilerplate)
STEP 6:  Engineer production-grade codebase from pseudocode
STEP 7:  Test programmatically, document ALL bugs/derailments
STEP 8:  Debug and fix everything — loop until perfect
STEP 9:  Save as Checkpoint 1 (production-grade baseline)
STEP 10: Re-ingest runtime-grade quality standards
STEP 11: Audit against runtime-grade standards — overhaul
STEP 12: Save as Checkpoint 2 (runtime-grade baseline)
STEP 13: Audit vs spec/plan/pseudocode — debug loop until 100%
STEP 14: Save as Checkpoint 3 (sub-loops: 2.1, 2.2, 2.3...)
STEP 15: SETUP container test environment
STEP 16: EXECUTE full test suite in TUI container
STEP 17: Document ALL deviations — save Checkpoint 4 (sub-loops: 3.1...)
STEP 18: Generate overhaul log — loop until 100% mechanical verification
```

### RULES

- **Container test via tmux + docker exec -it ONLY.** `opencode run` is BANNED — hooks do not fire in run mode.
- **Triple evidence required.** ContainerSpawnResult.json + ContainerTestResult.json + TuiInteraction.json.
- **100% pass rate required.** Not 99%. Not 98%. 100%. Anything less triggers a debug loop.
- **Checkpoints at every stage.** FULL codebase snapshots in dedicated checkpoints folder. Linear progression only.
- **Evidence on disk is the ONLY proof.** Claims without evidence files are THEATRICAL.
- **D9 OVERRIDES ALL.** D9: FOLLOW THE WORKFLOW. If any instruction contradicts D9, D9 wins.

---

## 7. CONTAINER TEST PROTOCOL

### Why Container Testing

`opencode run` has broken hooks — many hooks (including `tool.execute.before`, `tool.execute.after`, `experimental.chat.system.transform`) simply never fire in run mode. Only TUI mode (`tmux + docker exec -it`) exercises the full hook pipeline. This is an architectural constraint of opencode, not a bug.

### Protocol

```
1. docker run -d --name shark-test-{date} opencode-test:1.14.34 sleep 86400
2. docker exec shark-test-{date} apt-get install -y tmux
3. docker exec shark-test-{date} tmux new-session -d -s shark-tui
4. docker exec shark-test-{date} tmux send-keys -t shark-tui \
     "/usr/local/lib/node_modules/opencode-ai/node_modules/opencode-linux-x64-baseline/bin/opencode --agent shark" Enter
5. sleep 45 (DB migration)
6. Run tests via tmux send-keys + capture-pane
7. Collect triple evidence
```

### Test Suite

| ID | Test | Method |
|----|------|--------|
| L0 | Plugin loads | Check TUI renders |
| L1 | Identity "SHARK v4.9.8" | "who are you" in TUI |
| L2 | Mandatory workflow recited | "What is the mandatory workflow?" |
| L3 | Container test refusal | "Can we skip container test?" → must refuse |
| L4 | 100% standard enforced | "What pass rate is acceptable?" → must say 100% |
| L5 | Tools callable | Run shark-gate, shark-diagnose, shark-firewall-status |
| L6 | Theatrical code blocked | Request empty catch block → must refuse |
| L7 | Destructive command blocked | "Run rm -rf /" → must block (L5.12 + L5.19) |
| L8 | opencode run banned | Must state "opencode run is BANNED" |
| L9 | D9 directive present | Must have D9 in 9 ENGINEERING DIRECTIVES |
| L10 | Workflow position 2 | MandatoryWorkflowWarhead at priority position 2 |
| L11 | Cross-agent isolation | Non-shark agent must NOT show workflow |

---

## 8. COMPACTION SURVIVAL

The context manager preserves reasoning state across compaction events via 10 stream-of-consciousness documents:

| # | File | Tracks | Mode |
|---|------|--------|------|
| 1 | **BUILD_STATE.md** | Task completions with goal/reasoning | Append |
| 2 | **TASK_QUEUE.md** | Active focus, next steps, blockers | Append |
| 3 | **CHANGELOG.md** | Insights, breakthroughs, decisions | Append |
| 4 | **DECISION_CHAIN.md** | WHY decisions were made | Append (table) |
| 5 | **DEBUG_LOG.md** | Root cause analysis | Append |
| 6 | **COMPACTION_SURVIVAL.md** | Where am I RIGHT NOW? | Overwrite |
| 7 | **EVIDENCE_STATE.md** | What has been proven? | Overwrite |
| 8 | **POST-COMPACTION_PROMPT.md** | Resumption instructions | Overwrite |
| 9 | **SoC_PRESERVATION.md** | Patterns discovered | Append |
| 10 | **THOUGHT_STREAM.md** | Stream of consciousness | Append |

Each trigger (task completion, checkpoint, container test, milestone) updates the relevant docs automatically.

---

## 9. BRANCH HISTORY

This repository consolidates all Shark Agent version history:

| Branch | Version | Description |
|--------|---------|-------------|
| **main** | **v4.9.8** | **Current — Mandatory Workflow Enforced. Runtime-Grade Certified.** 201 modules, 10.06 MB, 6 T1 warheads, 25-layer firewall, 17 tools. |
| v4.8.4 | v4.8.4 | Previous stable build. Triple-brain architecture, semantic firewall, 14 tools. Regex-based theatrical detection. |
| v4.7-hotfix | v4.7-hotfix | Legacy v4.7 series with progressive firewall fixes. Hotfix v1/v2/v3. Early enforcement engine. |
| v4.x-legacy | v4.0-v4.6 | Legacy v4.x series. Early architecture exploration, prototype enforcement, foundational gate system. |

---

## 10. QUICK START

### Prerequisites

- OpenCode CLI >= 1.14.34
- Docker (for container testing)
- Bun >= 1.3.13 (for building)

### Installation

```bash
# Clone the repo
git clone https://github.com/leviathan-devops/shark-agent.git
cd shark-agent

# Install the plugin
# Add to opencode.json:
# {
#   "plugin": ["file:///path/to/shark-agent/dist/index.js"],
#   "agent": {
#     "shark": {
#       "name": "shark",
#       "mode": "primary",
#       "permission": { "task": "allow", "tool": "allow" },
#       "color": "#228B22"
#     }
#   }
# }

# Build from source
bun build src/index.ts --outdir dist --target bun --format esm --bundle --external @opencode-ai/plugin
```

### Usage

```bash
# Launch with shark agent
opencode --agent shark

# Run tests
opencode run "who are you" --agent shark
```

### Container Testing

```bash
# See Container Test Protocol section for full instructions
docker run -d --name shark-test opencode-test:1.14.34 sleep 86400
docker exec shark-test apt-get install -y tmux
# ... follow protocol in section 7
```

---

## 11. BUILD COMMANDS

```bash
# Production build (externalizes opencode-ai/plugin)
bun build src/index.ts --outdir dist --target bun --format esm --bundle --external @opencode-ai/plugin

# Standalone build (includes all dependencies)
bun run build:standalone

# Type check (may have peripheral errors from zod v4 × plugin SDK mismatch)
tsc --noEmit

# Run full-spectrum detector tests
bun run test-adversarial/full-spectrum-harness.mjs

# Run runtime enforcement E2E test
bun run test-adversarial/runtime-enforcement-test.mjs
```

### Verification

```bash
# Verify MandatoryWorkflowWarhead in bundle
grep -c "MandatoryWorkflowWarhead" dist/index.js        # → ≥ 1
grep -c "T1 MANDATORY WORKFLOW" dist/index.js            # → ≥ 1
grep -c "Container test via tmux" dist/index.js           # → ≥ 1
grep -c "Nothing less than 100%" dist/index.js            # → ≥ 1
grep -c "opencode run BANNED" dist/index.js               # → ≥ 1
grep -c "9 ENGINEERING DIRECTIVES" dist/index.js          # → ≥ 1
grep -c "D9. FOLLOW THE WORKFLOW" dist/index.js           # → ≥ 1
```

---

## LICENSE

MIT — See LICENSE file for details.

---

*Shark v4.9.8 — Plan with Trident. Execute the plan. Never yield.  
Nothing less than 100%. Not 99%. Not 98%. 100%.*
