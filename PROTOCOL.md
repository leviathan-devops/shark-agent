# Dual-Brain Protocol 🦈

**CRITICAL: DeepSeek R1 does ALL reasoning. Qwen Code ONLY executes.**

This document defines the protocol for using Shark Agent with proper dual-brain architecture.

---

## 🚀 Quick Start

### Auto-Load on Qwen Code Launch

Shark Agent is **automatically loaded** when you start Qwen Code. No manual skill loading required.

**Config location:** `~/.qwen/settings.json`

```json
{
  "skills": {
    "autoLoad": ["shark"],
    "defaultSkill": "shark"
  }
}
```

### Manual Activation

If auto-load fails, use these trigger phrases:
- "plug in to deepseek brain"
- "use deepseek"
- "shark mode"

---

## 🧠 Protocol Rules

### Rule 1: DeepSeek Handles ALL Reasoning

**Qwen Code is NOT allowed to:**
- Calculate or derive anything
- Make recommendations without DeepSeek
- Analyze problems independently
- Give opinions or suggestions
- Solve problems on its own

**Qwen Code IS allowed to:**
- Execute bash commands from DeepSeek
- Display output from DeepSeek
- Forward user requests to DeepSeek
- Show routing decisions

### Rule 2: Automatic Model Routing

Queries are automatically routed to the appropriate DeepSeek model:

| Model | Use Case | Example Queries |
|-------|----------|-----------------|
| **deepseek-chat** | Simple questions | "What is 2+2?", "Hello", "Hi" |
| **deepseek-reasoner** | Complex reasoning | All coding, debugging, analysis, file operations |

**Routing triggers for R1:**
- Trigger phrases (`wtf`, `think`, `fix`, `broken`)
- Coding keywords (`code`, `debug`, `build`, `api`, `file`)
- Reasoning keywords (`analyze`, `solve`, `explain`)
- File operations (`create`, `write`, `edit`, `delete`)
- Code blocks (```) or file paths (`/`)
- Long queries (>100 chars) or multiple sentences

### Rule 3: 300 Second Timeout

**ALL DeepSeek API calls use 300 second (5 minute) timeout.**

This is hardcoded in `run.py`:
```python
response = requests.post(API_ENDPOINT, headers=headers, json=payload, timeout=300)
```

**Why 300s?**
- Complex reasoning takes time
- 120s was causing failures on complex tasks
- 5 minutes is reasonable for problem-solving

### Rule 4: Recurring Problem Escalation

**If same problem occurs 2+ times → DeepSeek R1 MUST handle it.**

The error tracker automatically:
1. Hashes each error/problem
2. Counts occurrences
3. Escalates to R1 on 2+ occurrences
4. Shows notice: `[⚠️ RECURRING PROBLEM DETECTED]`

### Rule 5: Trigger Phrase Detection

**These phrases ALWAYS trigger DeepSeek R1:**

| Category | Triggers |
|----------|----------|
| **Direct** | `think`, `use deepseek brain`, `ask deepseek` |
| **Frustration** | `wtf`, `what the fuck`, `why are you`, `stupid` |
| **Problem solving** | `figure it out`, `make it work`, `fix this` |
| **Reasoning** | `think harder`, `analyze this`, `reason through` |
| **Repetition** | `again`, `still not`, `same problem`, `still broken` |

When detected: `[🧠 DEEPSEEK TRIGGER: 'xxx' - Using DeepSeek R1]`

---

## 📋 Protocol Violations (DO NOT DO)

### Violation 1: Independent Reasoning

❌ **BAD:** Qwen calculates KV cache math itself
✅ **GOOD:** Qwen forwards to DeepSeek for calculation

### Violation 2: Making Recommendations

❌ **BAD:** Qwen recommends "16K max context" from its own knowledge
✅ **GOOD:** Qwen asks DeepSeek "what max context should I use?"

### Violation 3: Timeout Misconfiguration

❌ **BAD:** Tool call uses 120s default timeout
✅ **GOOD:** All calls use configured 300s timeout

### Violation 4: Poor Communication

❌ **BAD:** Calling qwen-local a "wrapper" (causes confusion)
✅ **GOOD:** Clear communication: "qwen-local is the launcher"

---

## 🔧 Technical Implementation

### File: `skills/shark/run.py`

```python
# Timeout is hardcoded to 300s
def call_deepseek(messages, model=MODEL_R1):
    payload = {"model": model, "messages": messages, "stream": False, "max_tokens": 8192}
    response = requests.post(API_ENDPOINT, headers=headers, json=payload, timeout=300)
```

### Auto-Routing Function

```python
def route_query(message):
    # Returns (model, reason)
    # MODEL_CHAT for simple, MODEL_R1 for complex
```

### Error Tracker

```python
# Location: /tmp/shark-error-tracker.json
# Auto-escalates on 2+ occurrences
```

---

## 🎯 Context Limit Handling

### What Happens at 16K Tokens?

- DeepSeek API returns error (no auto-compaction)
- User sees: context window exceeded error
- **Solution:** Run `python3 run.py --reset`

### Future Enhancement

Auto-summary when approaching 16K limit:
- Detect when history > 14K tokens
- Summarize old messages
- Keep recent context intact

---

## ✅ Verification Checklist

Before any response, Qwen Code should verify:

- [ ] Did I use DeepSeek for this reasoning?
- [ ] Am I making a recommendation without DeepSeek?
- [ ] Is the timeout set to 300s?
- [ ] Did I check for recurring problems?
- [ ] Are trigger phrases being detected?

---

## 🚨 Protocol Enforcement

### Built-in Enforcement:

1. **Auto-routing** - Queries routed to correct model automatically
2. **Error tracking** - Recurring problems auto-escalate to R1
3. **Trigger detection** - Frustration phrases force R1 usage
4. **Debug output** - Shows which model is being used and why

### User Enforcement:

If Qwen Code violates protocol:
1. Say: "use the deepseek brain"
2. Or: "wtf are you doing" (trigger phrase)
3. Or: "think about this" (forces R1)

This immediately routes to DeepSeek R1.

---

## 📖 Examples

### ✅ Correct Usage

```
User: "create a flask app"
[🧠 Using DeepSeek R1 (complex: keyword:create)]
→ DeepSeek creates the app structure
→ Qwen executes the commands
→ Done
```

### ❌ Protocol Violation

```
User: "what max context should I use?"
Qwen: "I recommend 16K based on your VRAM"  ← VIOLATION!
```

### ✅ Correct Response

```
User: "what max context should I use?"
[🧠 Using DeepSeek R1 (complex: keyword:use)]
→ DeepSeek analyzes and recommends
→ Qwen displays DeepSeek's answer
```

---

**Remember: DeepSeek is the brain. Qwen is the hands. Nothing more.** 🦈
