# Shark Agent - Context Brief for Local Setup

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

The local model must NOT:
- Calculate or derive answers independently
- Make recommendations without DeepSeek
- Analyze problems on its own
- Give opinions or suggestions
- Solve problems itself

The local model IS allowed to:
- Execute bash commands from DeepSeek
- Display output from DeepSeek
- Forward user requests to DeepSeek
- Show routing decisions

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

## File Structure

```
~/.qwen/skills/shark/
├── run.py              # Main entry point
├── shark-brain.py      # Interactive terminal mode
├── shark-loop.py       # Auto-execute loop
├── shark-client.py     # DeepSeek API client
├── SKILL.md            # Skill definition
└── skill.json          # Manifest
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

## Contact / Support

- GitHub: https://github.com/leviathan-devops/shark-agent
- Protocol: See PROTOCOL.md in repo
- Architecture: See docs/ARCHITECTURE.md

---

**Remember: DeepSeek R1 = Brain. Local Model = Hands. Nothing more.** 🦈
