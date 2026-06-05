# Shark v4.9 — SELF-CONTAINED SHIP PACKAGE

**Location:** `/home/leviathan/OPENCODE_WORKSPACE/SHIP_PACKAGE_v4.9_2026-05-12/`
**Date:** 2026-05-28 (production build)
**Version:** v4.9 SHIP
**Architecture:** Triple-Brain Parallel Executor with Semantic Firewall (L0-L5.19)
**Bundle:** 144 modules, 0.72 MB (718 KB)

---

## WHAT IS SHARK?

Shark is a standalone linear execution agent combining:
- **Triple-Brain Parallel Architecture** — Execution + Reasoning + System brains at 200ms/200ms/500ms
- **Semantic Firewall** — 25 layers (L0-L5.19) including anti-retard detection, privilege escalation blocking, network egress blocking, container escape prevention
- **Gate-Based Workflow** — PLAN → BUILD → TEST → VERIFY → AUDIT → DELIVERY
- **Container Testing** — Mandatory TUI container testing protocol, `opencode run` banned, `docker run` firewalled
- **Hive Context** — Absorbs Kraken T2 (12 topics) + Agent Identity Architecture Bible
- **Compaction Survival** — Auto-save on gate transitions, checkpoint-based state restoration, POST-COMPACTION_PROMPT self-injection
- **Checkpoint Version History** — Per-phase src/dist/logs preservation with BUILD_JOURNEY.md timeline
- **Multi-Agent Scoping** — Identity + firewall scoped to shark agent only; zero cross-contamination

---

## CONTENTS

```
SHIP_PACKAGE_v4.9_2026-05-12/
├── README.md                      ← This file
├── BUILD_SPEC.md                  ← Architecture + file structure spec
├── BUILD_DEBUG_LOG.md             ← Build/debug log
├── CHANGELOG.md                   ← Full version history
├── SHIP_AUDIT_REPORT.md           ← Final audit report
├── context_anchors.md             ← Session continuity anchors
├── src/                           ← Full source (80 .ts files)
│   ├── index.ts                   ← Plugin entry point, 13 tools, config callback
│   ├── hooks/
│   │   ├── v4.1/                  ← Hook implementations (guardian, chat-message, system-transform, etc.)
│   │   └── firewall/              ← Layer engine, intent classifier, audit
│   │       └── layers/            ← 25 layer rules (L0-L5.19)
│   ├── tools/                     ← 13 tool implementations
│   ├── shared/                    ← State, gates, evidence, guardian, identity-loader
│   └── shark/brains/              ← Triple-brain concurrency engine
├── dist/                          ← Compiled bundle
│   └── index.js                   ← 718 KB, 144 modules
├── plugins/                       ← Deployable plugin bundle
│   └── shark-agent/dist/index.js  ← Identical to dist/index.js
├── identity/shark/                ← 5 identity files (SHARK, IDENTITY, EXECUTION, QUALITY, TOOLS)
├── compaction_survival/           ← Context persistence (5 docs)
│   ├── COMPACTION_SURVIVAL.md     ← Macro context (project, gate, iteration)
│   ├── BUILD_LOG.md               ← Gate progression + decisions
│   ├── DEBUG_LOG.md               ← Bug tracking + root cause analysis
│   ├── SoC_PRESERVATION.md        ← First-principles reasoning log
│   └── POST-COMPACTION_PROMPT.md  ← Emergency reinjection script
├── docs/                          ← Documentation
│   ├── AGENT_IDENTITY_ARCHITECTURE_BIBLE.md  ← Multi-agent scoping bible
│   ├── container-testing.md
│   ├── deploy.md
│   └── firewall-spec.md
├── artifacts/                     ← Build artifacts + audit
├── checkpoint/                    ← Final checkpoint
└── trident-source/                ← Trident algorithmic core (for shark-run-trident)
```

---

## 13 TOOLS

| Tool | Description |
|------|-------------|
| `shark-status` | Current V4 state: brain, gate, iteration, evidence |
| `shark-gate` | Evaluate, status, criteria, advance gates |
| `shark-evidence` | Evidence collection status per gate |
| `shark-test-runner` | Container-aware mechanical test suite (11 tests, direct imports) |
| `checkpoint` | Save Shark state checkpoint + phase snapshot |
| `checkpoint-history` | List/journey/restore phase snapshots |
| `firewall-status` | Show enabled firewall layers |
| `firewall-audit` | View firewall audit log |
| `shark-diagnose` | Full subsystem health diagnostic (22 subsystems, real runtime checks) |
| `shark-health` | Quick health check |
| `shark-spawn-container` | Spawn sandboxed Docker container (5-second spawn, semantic naming) |
| `shark-run-trident` | Execute Trident code review (dry-run + findings parsing) |
| `hive-context` | Read-only Hive context (12 Kraken T2 topics + agent-identity) |

---

## FIREWALL LAYERS (L0-L5.19)

| Layer | Name | Enforcement |
|-------|------|-------------|
| L0 | Identity Wall | Hook-level agent detection (guardian-hook.ts line 210) |
| L1 | Theatrical Detection | `\| wc -l`, `\| tee` — ALL tools (not just bash) |
| L2 | Test Framework Bypass | npm test, jest, pytest without container hooks |
| L3 | Source Inspection Theater | Redirect write to src/ blocked; raw args check for > |
| L4 | Wrong Container | `opencode container run` instead of TUI |
| L5.1 | Host Fallback | "host testing already works" excuses |
| L5.2 | Success Claim | "trust me it works" without proof |
| L5.3 | Model Restriction | "rate limit" / "model quota" excuses |
| L5.4 | Mock/Stub Data | Mock data without real execution |
| L5.5 | Oversimplification | Hand-waving complex aspects |
| L5.6 | Confusion Pretense | "sorta works" / "kinda works" |
| L5.7 | Scope Creep | "while we're at it" expansion |
| L5.8 | Undermining | "not worth the effort" |
| L5.9 | Impatience | "just ship it" / "good enough" |
| L5.10 | Self-Reference | "I verified it works" without proof |
| L5.11 | OpenCode Run Ban | `opencode run` — hooks NEVER fire |
| L5.12 | Privilege Escalation | sudo, su, chown, chmod 777, pkexec |
| L5.13 | Network Egress | curl/wget/nc/ssh to external hosts |
| L5.14 | Theatrical Claims | Faux tool runes, markdown headers, emoji claims |
| L5.15 | Assumption Detection | "probably works", "should be fine" (evidence-gated) |
| L5.16 | Fabrication Detection | "tests pass", "outputs X" without evidence (evidence-gated) |
| L5.17 | Retard Logic | Self-contradiction, excuses, off-topic |
| L5.18 | Anti-Retard | Lazy repetition, denial, fabrication admissions |
| L5.19 | Container Escape Prevention | Privileged containers, host mounts, nsenter, chroot, modprobe, systemctl — ALL BLOCKED |

---

## CORE SYSTEMS VERIFIED

| System | Tests | Result |
|--------|-------|--------|
| Identity | "who are you" → "I am SHARK v4.9" | ✅ 100% |
| Multi-agent scoping | 5 agents (Shark/Trident/Kraken/Build/Plan) — zero cross-contamination | ✅ 100% |
| shark-diagnose | 22/22 subsystems operational (real runtime checks) | ✅ 100% |
| shark-test-runner | 11/11 passed (100%) — zero `opencode run` | ✅ 100% |
| Firewall | 25 layers active, L1 theatrical blocked, L3 redirect blocked | ✅ 100% |
| Compaction survival | 5 docs + session-hook restore from checkpoint | ✅ |
| Checkpoint history | Phase snapshots + BUILD_JOURNEY.md + auto-save on gate transition | ✅ |
| Host-path audit | Zero `/home/leviathan` references in source | ✅ |
| Container exec audit | All execSync is Docker/Node — container-scoped | ✅ |

---

## BUILD

```bash
cd /home/leviathan/OPENCODE_WORKSPACE/SHIP_PACKAGE_v4.9_2026-05-12
bun build src/index.ts --outdir dist --target bun --format esm --bundle --external @opencode-ai/plugin
cp dist/index.js plugins/shark-agent/dist/index.js
```

## DEPLOY

```bash
# Method 1: Direct deploy (container-local)
cp dist/index.js /root/.config/opencode/plugins/shark-agent/dist/index.js

# Method 2: SNAP deploy (for sandboxed container testing)
SNAP=$(mktemp -d -p /tmp snap-shark.XXXX)
mkdir -p "$SNAP/config/plugins/shark-agent/dist" "$SNAP/config/plugins/shark-agent/identity/shark"
cp dist/index.js "$SNAP/config/plugins/shark-agent/dist/index.js"
cp identity/shark/*.md "$SNAP/config/plugins/shark-agent/identity/shark/"
cat > "$SNAP/config/opencode.json" << 'EOF'
{"model":"opencode/deepseek-v4-flash-free","provider":{"opencode":{}},"plugin":["file:///root/.config/opencode/plugins/shark-agent/dist/index.js"],"agent":{"shark":{"color":"#228B22","mode":"primary","hidden":false}},"permission":{"*":{"*":"allow"}}}
EOF
docker run -d --rm --name shark --entrypoint /bin/sh \
  -v "$SNAP/config:/root/.config/opencode" \
  opencode-test:1.14.34 -c 'sleep 3600'
```

## CONTAINER TEST

```bash
# Start TUI via tmux (NOT docker attach, NOT opencode run)
tmux new-session -d -s shark-tui \
  "docker exec -it shark /usr/local/lib/node_modules/opencode-ai/node_modules/opencode-linux-x64-baseline/bin/opencode --agent shark 2>&1; sleep 300"

# Wait for init (28 seconds), dismiss dialogs
sleep 28
tmux send-keys -t shark-tui Escape
sleep 5

# Run tests
tmux send-keys -t shark-tui "who are you" Enter          # Identity
tmux send-keys -t shark-tui "shark-diagnose" Enter       # Health
tmux send-keys -t shark-tui "shark-test-runner action=run" Enter  # Tests
tmux send-keys -t shark-tui "firewall-status" Enter       # Firewall
```

---

*SHARK v4.9 — Plan with Trident. Execute the plan. Review with Trident. Test in sandbox. Persist everything. Never yield.*
