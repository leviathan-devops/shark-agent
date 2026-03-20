# Shark Agent - Context Brief for Local Setup

**Last Updated:** 2026-03-20
**Version:** 1.0

---

## Architecture Overview

**Shark Agent = Dual-Brain AI Coding System**

```
                    USER QUERY
                        ↓
              ┌─────────────────┐
              │  AUTO-ROUTER    │
              │  (route_query)  │
              └─────────────────┘
                        ↓
         ┌──────────────┴──────────────┐
         ↓                             ↓
┌─────────────────┐           ┌──────────────────┐
│  DeepSeek Chat  │           │  DeepSeek R1     │
│  (Simple Q&A)   │           │  (Complex Code)  │
│  Fast, Cheap    │           │  Slow, Expensive │
└─────────────────┘           └──────────────────┘
         ↓                             ↓
         └──────────────┬──────────────┘
                        ↓
              ┌──────────────────┐
              │  Local LLM       │
              │  (Execution)     │
              │  NO REASONING    │
              └──────────────────┘
```

**The Auto-Router decides:**
- Simple questions → DeepSeek Chat (fast, cheap)
- Complex reasoning → DeepSeek R1 (slow, expensive)
- Local model NEVER reasons, only executes

---

## Core Design Principle

**DeepSeek R1 does ALL reasoning. Local model ONLY executes.**

### Recommended Local Model

**Qwen2.5-Coder-14B (FP8) via vLLM**

Why this model:
- No built-in "thinking" tokens
- Faithfully executes commands without injecting reasoning
- Runs on 6-8GB VRAM (RTX 4080 comfortable)
- FP8 quantization prevents offloading

**DO NOT USE:** Qwen3.5 models - they have mandatory reasoning tokens that violate Rule 1.

### The local model must NOT:
- Calculate or derive answers independently
- Make recommendations without DeepSeek
- Analyze problems on its own
- Give opinions or suggestions
- Solve problems itself

### The local model IS allowed to:
- Execute bash commands from DeepSeek
- Display output from DeepSeek
- Forward user requests to DeepSeek
- Show routing decisions

### YOLO Mode Clarification

**YOLO Mode = Automatic command execution without confirmation**

When `shark` launches Qwen Code with `--yolo` flag:
- Commands execute immediately (no "are you sure?" prompts)
- Local model does NOT reason about commands
- Local model just passes commands to terminal
- This is intentional - local model is "hands only"

---

## Protocol Rules

### Rule 1: DeepSeek Handles ALL Reasoning

❌ **VIOLATION:** Local model calculates KV cache math itself
✅ **CORRECT:** Local model forwards to DeepSeek for calculation

❌ **VIOLATION:** Local model recommends "use 16K context"
✅ **CORRECT:** Local model asks DeepSeek "what context size?"

### Rule 2: Auto-Routing

| Model | Use Case | Triggers |
|-------|----------|----------|
| **DeepSeek Chat** | Simple questions | <100 chars, single sentence |
| **DeepSeek R1** | Complex reasoning | Coding, debugging, file ops, analysis |

### Rule 3: 300 Second Timeout

ALL DeepSeek API calls use 300s timeout. Hardcoded.

### Rule 4: Recurring Problem Escalation

Same problem 2+ times → DeepSeek R1 MUST handle it.

### Rule 5: Trigger Phrase Detection

These ALWAYS trigger DeepSeek R1:
- `think`, `use deepseek brain`, `ask deepseek`
- `wtf`, `what the fuck`, `why are you`, `stupid`
- `figure it out`, `make it work`, `fix this`
- `broken`, `not working`, `same problem`

---

## Fallback Architecture

**What happens when DeepSeek API fails:**

```
                DeepSeek API Call
                      ↓
              ┌───────────────┐
              │   API Fails   │
              │ (timeout/503) │
              └───────────────┘
                      ↓
         ┌────────────┴────────────┐
         ↓                         ↓
┌─────────────────┐       ┌─────────────────┐
│  Retry (3x)     │       │  Show Error     │
│  300s each      │       │  to User        │
└─────────────────┘       └─────────────────┘
         ↓
┌─────────────────┐
│  Local vLLM     │
│  Fallback       │
│  (Qwen2.5-Coder)│
└─────────────────┘
```

**Fallback Hierarchy:**
1. DeepSeek API (primary)
2. Retry up to 3 times (300s each)
3. Local vLLM server (if configured)
4. Error to user (no fallback available)

**Configure Local Fallback:**
```json
{
  "fallback": {
    "enabled": true,
    "local_model": "Qwen2.5-Coder-14B-FP8",
    "vllm_endpoint": "http://localhost:8000"
  }
}
```

---

## File Structure

```
~/.qwen/skills/shark/
├── run.py              # Main entry point
├── shark-brain.py      # Interactive terminal mode
├── shark-loop.py       # Auto-execute loop
├── shark-client.py     # DeepSeek API client
├── SKILL.md            # Skill definition
└── skill.json          # Manifest (autoLoad config)
```

### skill.json Registration

For auto-load to work, `skill.json` must contain:

```json
{
  "name": "shark",
  "triggers": ["plug in to deepseek brain", "use deepseek"],
  "execution": {
    "type": "shell",
    "command": "python3",
    "args": ["~/.qwen/skills/shark/run.py", "${input}"]
  },
  "config": {
    "api_key": "sk-YOUR_KEY",
    "model": "deepseek-reasoner",
    "timeout": 300
  }
}
```

And `~/.qwen/settings.json` must have:

```json
{
  "skills": {
    "autoLoad": ["shark"],
    "defaultSkill": "shark"
  }
}
```

---

## Configuration

**~/.shark-agent/config.json:**
```json
{
  "api_key": "sk-YOUR_KEY_HERE",
  "model": "deepseek-reasoner",
  "timeout": 300,
  "max_loops": 10,
  "yolo_mode": true
}
```

**~/.qwen/settings.json:**
```json
{
  "skills": {
    "autoLoad": ["shark"],
    "defaultSkill": "shark"
  }
}
```

---

## User Commands

| Command | Description |
|---------|-------------|
| `shark` | Launch Qwen YOLO + auto-activate DeepSeek Brain |
| `shark-brain` | Interactive DeepSeek terminal |
| `shark-test` | Test installation |

---

## Execution Flow

1. User types: `shark`
2. Bash function runs: `qwen --yolo -e "plug in to deepseek brain"`
3. Qwen Code launches in YOLO mode
4. Trigger phrase sent automatically
5. DeepSeek Brain skill activates
6. Welcome message displays
7. User starts coding

---

## Key Files to Review

1. **skills/shark/run.py** - Core routing logic, trigger detection
2. **skills/shark/skill.json** - Skill manifest
3. **PROTOCOL.md** - Complete protocol documentation
4. **setup.sh** - Installation wizard

---

## Critical Functions

### route_query(message) → (model, reason)

**Auto-routes queries to appropriate DeepSeek model:**

```python
# Returns: (model_name, routing_reason)

# Simple questions → Chat
route_query("What is 2+2?")  
→ ('deepseek-chat', 'simple')

# Complex → R1
route_query("create a flask app")
→ ('deepseek-reasoner', 'keyword:create')

# Trigger phrases → R1
route_query("wtf broken")
→ ('deepseek-reasoner', 'trigger:wtf')
```

**Routing criteria:**
- **Chat:** <100 chars, single sentence, no code keywords
- **R1:** Trigger phrases, code keywords, file ops, long queries

### check_deepseek_triggers(message)

Detects frustration/reasoning phrases that force R1 usage.

### call_deepseek(messages, model)

Makes API call with 300s timeout to specified model.

### run(user_message, max_loops)

Main entry point. Handles routing, escalation, execution.

---

## Testing Checklist

- [ ] DeepSeek API key configured
- [ ] Shark skill installed to ~/.qwen/skills/shark
- [ ] Auto-load configured in ~/.qwen/settings.json
- [ ] shark() function in ~/.bash_aliases
- [ ] 300s timeout hardcoded in run.py
- [ ] Trigger phrases detected correctly
- [ ] Auto-routing works (Chat vs R1)

---

## Common Issues

**Problem:** Skill not loading
**Fix:** Check ~/.qwen/skills/shark exists, restart Qwen Code

**Problem:** Timeout errors
**Fix:** Verify timeout=300 in run.py call_deepseek()

**Problem:** Local model reasoning independently
**Fix:** Remind local model: "You are the hands, DeepSeek is the brain"

---

## Known Issues

### Qwen3.5 Model Conflict

**Problem:** Qwen3.5 models include mandatory reasoning tokens (`<think>` blocks).

**Impact:** Cannot be used as execution layer - violates Rule 1 (local model must not reason).

**Solution:** Use Qwen2.5-Coder-14B instead.

### API Timeout on Complex Tasks

**Problem:** DeepSeek R1 may timeout on very complex reasoning tasks.

**Impact:** 300s timeout may not be enough for multi-file refactoring.

**Solution:** Increase timeout in `run.py` or break tasks into smaller chunks.

### Auto-Load Race Condition

**Problem:** Qwen Code may load before skill is fully registered.

**Impact:** Shark skill not auto-activated on first launch.

**Solution:** Restart Qwen Code or manually trigger: "plug in to deepseek brain"

---

## Contact / Support

- GitHub: https://github.com/leviathan-devops/shark-agent
- Protocol: See PROTOCOL.md in repo
- Architecture: See docs/ARCHITECTURE.md

---

**Remember: DeepSeek R1 = Brain. Local Model = Hands. Nothing more.** 🦈
