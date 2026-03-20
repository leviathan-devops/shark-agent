# Shark Agent - Context Brief for Local Setup

**Last Updated:** 2026-03-20
**Version:** 1.0

---

## ⚠️ CRITICAL PROTOCOL - ZERO TOLERANCE

**THE LOCAL MODEL MAKES EXACTLY ONE DECISION:**
- Route query to DeepSeek Chat (simple) OR DeepSeek R1 (complex)

**THE LOCAL MODEL MAKES ZERO OTHER DECISIONS:**
- NO model recommendations
- NO quantization decisions
- NO file format choices
- NO fallback decisions
- NO autonomous reasoning of ANY kind

**VIOLATION = SYSTEM FAILURE**

If local model makes ANY decision besides routing → **IMMEDIATE TERMINATION**

---

## Primary Reasoning Brains

**DEFAULT: DeepSeek R1**
- API: https://api.deepseek.com
- Use for: ALL complex reasoning, coding, analysis
- Timeout: 300s hardcoded

**SECONDARY: Gemini 2.0 Flash Lite**
- API: https://generativelanguage.googleapis.com
- Use for: ONLY when DeepSeek API fails (500 RPD limit)
- Trigger phrases: "ask gemini", "use gemini brain", "gemini"

**NO LOCAL FALLBACK. EVER.**

DeepSeek API MUST work. If it fails, use Gemini. No local vLLM.

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

**DeepSeek R1 does ALL reasoning. Local model ONLY routes and executes.**

### THE LOCAL MODEL IS NOT ALLOWED TO THINK

**Sole Function:** Route queries
- Simple question → DeepSeek Chat
- Complex reasoning → DeepSeek R1

**PROHIBITED Actions (TERMINATION OFFENSES):**
- ❌ Recommending models ("use Q4_K_M instead")
- ❌ Making quantization decisions
- ❌ Choosing file formats
- ❌ Deciding on fallbacks
- ❌ ANY autonomous reasoning

**ALLOWED Actions:**
- ✅ Execute bash commands from DeepSeek
- ✅ Display output from DeepSeek
- ✅ Forward user requests to DeepSeek
- ✅ Show routing decisions
- ✅ Route simple→Chat, complex→R1

### Recommended Local Model (Execution ONLY)

**Qwen2.5-Coder-14B (FP8) via vLLM**

Why this model:
- No built-in "thinking" tokens
- Faithfully executes without injecting reasoning
- Runs on 6-8GB VRAM (RTX 4080 comfortable)

**DO NOT USE:** Qwen3.5 - mandatory reasoning tokens violate Rule 1.

**NOTE:** Model is for EXECUTION ONLY. All reasoning goes to DeepSeek.

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

**THREE-TIER FALLBACK - AUTOMATIC CHAIN**

```
                User Query
                    ↓
         ┌──────────────────┐
         │  DeepSeek R1     │
         │  (Primary Brain) │
         └──────────────────┘
                    ↓
         ┌──────────────────┐
         │  Timeout/Error?  │
         └──────────────────┘
                    ↓
         ┌──────────┴──────────┐
         ↓                     ↓
   ┌──────────┐         ┌──────────────┐
   │ Retry    │         │ All retries  │
   │ (3x 60s) │         │ exhausted    │
   └──────────┘         └──────────────┘
                              ↓
                    ┌──────────────────┐
                    │  Gemini API      │
                    │  (Blocked in EU) │
                    │  Works from SEA  │
                    └──────────────────┘
                              ↓
                    ┌──────────────────┐
                    │  OpenRouter      │
                    │  (RELIABLE)      │
                    │  - DeepSeek R1   │
                    │  - Healer Alpha  │
                    │  - Llama-3-70B   │
                    └──────────────────┘
                              ↓
                    ┌──────────────────┐
                    │  ERROR TO USER   │
                    └──────────────────┘
```

**Fallback Hierarchy (AUTOMATIC):**
1. **DeepSeek R1** (primary - ALWAYS first)
2. **Retry 3 times** (60s each, exponential backoff)
3. **Gemini 2.0 Flash** (may fail from Europe - blocked in EU)
4. **OpenRouter** (RELIABLE - multiple models available)
5. **ERROR** (system fails loudly)

**⚠️ GEMINI GEOBLOCK:**
Gemini free tier is BLOCKED in Europe. Works from Southeast Asia.
If you're in Europe, Gemini will return 429 quota errors.
The fallback chain automatically continues to OpenRouter.

**✅ OPENROUTER - RELIABLE FALLBACK:**
- `deepseek/deepseek-r1` - Same as DeepSeek API
- `openrouter/healer-alpha` - Xiaomi MiMo-V2-Omni (FREE, 262K context)
- `meta-llama/llama-3-70b-instruct` - Fast fallback

**Manual Triggers:**
- "ask gemini" → Use Gemini directly
- "use openrouter" → Use OpenRouter directly
- "use healer" → Use Healer Alpha via OpenRouter

**NO LOCAL vLLM. EVER.**

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

### CRITICAL: Local Model Protocol Violations

**Problem:** Local model making autonomous decisions (model recommendations, quantization choices, etc.)

**Impact:** VIOLATES ZERO TOLERANCE PROTOCOL - system failure

**Solution:** IMMEDIATE TERMINATION of local model session. Re-instruct: "You route ONLY. DeepSeek thinks."

---

## Contact / Support

- GitHub: https://github.com/leviathan-devops/shark-agent
- Protocol: See PROTOCOL.md in repo
- Architecture: See docs/ARCHITECTURE.md

---

**Remember: DeepSeek R1 = Brain. Local Model = Hands. Nothing more.** 🦈
