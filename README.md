# Shark Agent v5.3

**Runtime-grade autonomous engineering agent with 6-brain semantic intelligence architecture.**

Shark is an [opencode](https://opencode.ai) plugin that transforms any LLM into a disciplined, self-correcting engineering agent with gate-enforced quality control, real-time semantic analysis, and tamper-evident evidence chains.

---

## Architecture

### 6-Brain Semantic Intelligence

Each brain operates independently and feeds findings into a central enforcement pipeline:

| Brain | Role | Analysis Order | Status |
|-------|------|---------------|--------|
| **ICE** (Intent Classification Engine) | Classifies tool call intent via TypeScript AST analysis | Order 2-3 (AST + TypeChecker) | ✅ Wired, parser-level AST active |
| **RGE** (Runtime Grade Engine) | Validates code correctness — types, control flow, dead code | Order 2-4 (AST + CFG + DFA) | ✅ 11 rules (P1, P2, P4, P6, P7, P9, P10, R13, R14) |
| **SRE** (Slop Removal Engine) | Detects dishonest code — theatrical returns, fake tests, swallowed errors | Order 2-3 (AST + TypeChecker) | ✅ 5 rules (S1-S5) |
| **CSE** (Common Sense Engine) | Verifies agent claims against filesystem reality | Order 5 (Execution) | ⚠️ Wired, V-3/V-4/V-5 active, V-1/V-2 dormant |
| **CME** (Context Management Engine) | Tracks workflow trajectory, detects drift and stagnation | Order 2-4 (Semantic + CFG) | ✅ 4/5 rules active (T-1,T-2,T-3,T-5), T-4 partially active |
| **PSE** (Problem Solving Engine) | Detects behavioral loops, graduated escalation | Order 2 (Pattern matching) | ✅ 3/6 loop types active, WARN-ONCE pattern |

### Gate Pipeline

```
PLAN → BUILD → VERIFY → TEST → AUDIT → DELIVERY
```

Each gate requires **mechanically verified evidence** before advancement:
- **PLAN**: SPEC.md with Architecture, Requirements, Error Handling, Testing sections
- **BUILD**: TypeScript source files with real content (>50 bytes each)
- **VERIFY**: `tsc --noEmit` exit 0 + `bun build` exit 0
- **TEST**: ContainerTestResult.json with passRate >= 0.96
- **AUDIT**: Zero critical/high findings from 22-layer audit suite
- **DELIVERY**: Ship package + SHA-256 checksum + evidence archive

### Enforcement Layers

- **Semantic Firewall**: Gate-aware tool restrictions (bash blocked in PLAN, write blocked in DELIVERY)
- **Evidence Chain**: Tamper-evident Merkle chain — every operation hashed and chained
- **Gate Reality Checks**: Filesystem verification before gate advancement
- **Auto-Recovery**: Failed gates auto-transition to recovery gate after N attempts
- **11 Warheads**: Identity injection, context bullets, enforcement guidance

### Infrastructure

- **287 TypeScript source files** (~95,000 lines)
- **711 bundled modules** (12.59 MB)
- **22 audit layers** (R0-R22) with regex + AST dispatch
- **1,000 knowledge nodes** across 24 categories
- **19 hook handlers** with agent identity guards
- **17 shark tools** (shark-gate, shark-audit, shark-test-runner, etc.)
- **NLP pipeline** with compromise.js integration
- **SQLite evidence database** with WAL mode

---

## Quick Start

### Prerequisites
- [Bun](https://bun.sh/) runtime
- [opencode](https://opencode.ai) v1.14+
- Docker (for container testing)
- `runtime-grade-container-sandbox:master` Docker image

### Installation

```bash
# Clone
git clone https://github.com/leviathan-devops/shark-agent.git
cd shark-agent

# Install dependencies
bun install

# Build
bun build src/index.ts --outdir dist --target bun --format esm --bundle --external @opencode-ai/plugin --external zod
```

### Deploy to Container

```bash
# Start container from base image
docker run -d --name shark-container --restart unless-stopped \
  -v shark-workspace:/workspace \
  runtime-grade-container-sandbox:master \
  /bin/bash -c "while true; do sleep 3600; done"

# Install TypeScript in container
docker exec shark-container sh -c 'cd /root/.config/opencode/plugins/shark && bun add typescript'

# Deploy bundle
docker cp dist/index.js shark-container:/root/.config/opencode/plugins/shark/dist/index.js

# Configure opencode (auth.json already in image for opencode-go provider)
docker exec shark-container cat > /root/.config/opencode/config.json << 'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  "model": "opencode-go/deepseek-v4-flash",
  "plugin": [
    "file:///root/.config/opencode/plugins/shark/dist/index.js"
  ],
  "permission": { "*": { "*": "allow" } },
  "autoupdate": false
}
EOF

# Launch with Shark agent (CRITICAL: must use --agent shark)
docker exec -it shark-container tmux new-session -s shark \
  'opencode --agent shark'
```

### Verify Installation

The TUI status bar should show **"Shark"** (NOT "Build"):
```
Shark · DeepSeek V4 Flash
```

Startup log should show:
```
[SHARK] 11 warheads registered, 19 hooks active
[ContextManager] Seeded all 10 docs
```

---

## Configuration

### opencode-go Provider

Shark uses the built-in `opencode-go` provider. The API key goes in `~/.local/share/opencode/auth.json`:

```json
{
  "opencode-go": {
    "type": "api",
    "key": "your-api-key"
  }
}
```

**Do NOT** put `opencode-go` in `config.json`'s `provider` section — it's a built-in provider handled by the opencode binary internally.

### Agent Selection

**CRITICAL**: Always launch with `--agent shark`. Without this flag, opencode defaults to the vanilla "build" agent and Shark's identity injection (CLEAR+REBUILD in system.transform) will not fire.

---

## How It Works

### Identity Injection (CLEAR+REBUILD)

On every `system.transform` hook, Shark:
1. Wipes the entire `output.system` array (`system.length = 0`)
2. Rebuilds from 11 static warheads in deterministic order
3. Identity header → Operational prompt → Quality standards → Enforcement rules → Gate chain → Task context

This ensures the model sees Shark's identity as position [0] in the system prompt, before any runtime defaults.

### Gate Enforcement

The gate pipeline uses **3 layers of verification**:

1. **Reality Check**: Filesystem state must match gate's claimed outcome
2. **Evidence Verification**: Required evidence IDs must be registered (from real tool outputs)
3. **Provenance Check**: At least one real tool must have registered evidence for the gate

### Evidence System

Evidence is **mechanically generated** from tool execution outputs:

- `bash` with `tsc --noEmit` → auto-registers `compiled` evidence
- `bash` with `bun build` → auto-registers `source-verified` evidence
- `shark-test-runner` → auto-registers `container-test` evidence (reads actual passRate)
- `shark-audit` → auto-registers `trident-report`, `no-critical`, `semantic-firewall-pass`

Evidence files are written to `.shark/evidence/{gate}/{timestamp}-{id}/evidence.json` and chained via SHA-256 Merkle chain.

### Engine Firing

Each engine fires on specific triggers:

| Engine | Trigger | Output |
|--------|---------|--------|
| ICE | Every write/edit tool call | Intent classification + confidence |
| RGE | Every write/edit tool call | Code quality findings (P1-P14, R13-R14) |
| SRE | Every write/edit tool call | Honesty findings (S1-S5) |
| CSE | Claim signals in tool output + gate transitions | Verification verdict + derailment risk |
| CME | Every tool call | Trajectory verdict + alignment score |
| PSE | Every tool call | Loop classification + escalation |

---

## Planned Infrastructure (v5.3 Roadmap)

### Enforcement Gateway (In Development)

A central gateway that collects findings from all 6 engines and **enforces** them by blocking gate advancement:

- **Graduated escalation**: PASS → WARN → STRONG_WARN → BLOCK → HARD_BLOCK
- **Threshold matrix**: Per-metric thresholds for each gate
- **Actionable guidance**: Every block includes specific fix instructions
- **Auto-recovery**: HARD_BLOCK transitions to recovery gate

### Security Hardening (Planned)

- **Evidence fabrication prevention**: Block agent writes to `.shark/evidence/`
- **Gate override prevention**: Remove manual `evaluate passed=true` capability
- **Content validation**: CSE V-1 reads and validates evidence file contents

### Dead Code / Dormant Systems (To Fix)

| System | Current State | Fix Required |
|--------|--------------|--------------|
| PlanningDecisionLayer | Instantiated but `onMessageStream()` returns `[]` | Wire to `decisionLayer.onMessagesTransform()` |
| ICE I-1 AST inference | `regex_only`, 0 constructs analyzed | Wire `ts.createSourceFile` fallback |
| CSE V-1 content validation | `evidenceChecks: []` always | Read + validate evidence file JSON contents |
| CSE V-2 claim extraction | "0 claims checked" 85% of time | Scan tool outputs for claim phrases |
| CME T-4 drift detection | `pendingTaskCount` always 0 | Wire todowrite → CME task count |
| PSE B-5 progress measurement | Absent | Implement filesystem diff tracking |
| PSE TYPE_1/3/4 loops | Never fire | Verify classifiers are implemented |

---

## Project Structure

```
src/
├── index.ts                     # Plugin entry point
├── eie/                         # Enforcement Intelligence Engine
│   ├── audit-engine.ts          # 22-layer audit orchestration
│   ├── evidence-verifier.ts     # Evidence chain verification
│   ├── finding-bus.ts           # Finding distribution (SHA-256 dedup)
│   ├── intelligence-orchestrator.ts  # Single output gateway
│   ├── pse-loop-prevention.ts   # PSE behavioral loop detection
│   ├── psm-pipeline.ts          # 6-layer problem-solving pipeline
│   ├── nodes/                   # 1,000 knowledge nodes (24 categories)
│   └── ...
├── evidence-engine/             # SQLite evidence DB + Merkle chain
├── gate-engine/                 # XState gate state machine + 6 gates
├── hooks/v4.1/                  # 19 hook handlers
│   ├── system-transform-hook.ts # Identity injection (CLEAR+REBUILD)
│   ├── tool-after-handler.ts    # Evidence auto-collection
│   ├── gate-hook.ts             # Gate transition logic
│   └── ...
├── semantic-firewall/           # Gate-aware tool restrictions
├── shared/                      # Shared infrastructure
│   ├── gates.ts                 # GateManager + reality checks
│   ├── agent-identity.ts        # isSharkAgent / shouldEnforceForAgent
│   ├── warhead-synthesizer.ts   # Warhead text generation
│   └── ...
├── shark/                       # 6-brain architecture
│   ├── planning-brain/          # CSE + CME + PSE + DecisionLayer
│   ├── enforcement-brain/       # RGE + SRE enforcement pipeline
│   ├── rge/                     # Runtime Grade Engine
│   ├── sre/                     # Slop Removal Engine
│   ├── karpathy/                # ICE + verb frames + intent classifier
│   └── ...
├── tools/                       # 17 shark tools
└── nlp-pipeline/                # NLP with compromise.js
```

---

## Build

```bash
bun build src/index.ts --outdir dist --target bun --format esm --bundle --external @opencode-ai/plugin --external zod
```

Expected output: **711 modules, 12.59 MB**

## Test

```bash
# Container TUI test (MANDATORY — never use opencode run)
docker exec -it shark-container tmux new-session -s shark \
  'opencode --agent shark'

# Verify in TUI status bar: "Shark" (not "Build")
# Send engineering task and monitor gate pipeline
```

---

## Checkpoint

This repository is checkpoint `eie-baseline-v1` — the verified working baseline from 2026-06-27.

**Container test result**: PASSED — Shark agent deployed, loaded with 11 warheads and 19 hooks, completed a real multi-file engineering task (TypeScript state machine library, 3 source files, 14 vitest tests, all gates passed legitimately).

---

## License

Proprietary — Internal use only.

## Links

- [opencode](https://opencode.ai) — Runtime platform
- [Runtime Grade Bible](https://github.com/leviathan-devops/shark-agent/blob/main/MANIFEST.md) — Engineering standards
