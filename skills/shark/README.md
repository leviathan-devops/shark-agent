# DeepSeek Brain Skill

**Activate:** Say "plug in to deepseek brain" or "use deepseek reasoning"

**What it does:** Connects to DeepSeek R1 API. DeepSeek thinks, Qwen Code executes.

---

## Quick Start

```bash
# One-shot command
python3 ~/.qwen/skills/deepseek-brain/deepseek-loop.py "create a flask app"

# Reset and start fresh
python3 ~/.qwen/skills/deepseek-brain/deepseek-loop.py --reset "new task"

# Interactive mode
python3 ~/.qwen/skills/deepseek-brain/deepseek-brain.py
```

---

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   You       │ ──→ │  Qwen Code   │ ──→ │ DeepSeek R1 │
│  (input)    │     │  (executor)  │     │  (brain)    │
└─────────────┘     └──────────────┘     └─────────────┘
                           ↓
                    ┌──────────────┐
                    │   bash cmd   │
                    │   execution  │
                    └──────────────┘
```

- **DeepSeek R1** = Reasoning (smarter, better at complex tasks)
- **Qwen Code** = Execution (device access, runs commands)

---

## Files

| File | Purpose |
|------|---------|
| `deepseek-loop.py` | Full auto-execute loop |
| `deepseek-client.py` | API client only |
| `deepseek-brain.py` | Interactive terminal mode |

---

## Configuration

- **API Key:** `sk-e8e93e31b582423e9fdaa4ab8e9347e2`
- **History:** `/tmp/deepseek-history.json`
- **Model:** `deepseek-reasoner`
- **Timeout:** 120s API, 300s commands

---

## Examples

**Create a project:**
```bash
python3 ~/.qwen/skills/deepseek-brain/deepseek-loop.py "scaffold a react app with vite"
```

**Debug something:**
```bash
python3 ~/.qwen/skills/deepseek-brain/deepseek-loop.py "why is my python script failing? check logs/"
```

**Install and run:**
```bash
python3 ~/.qwen/skills/deepseek-brain/deepseek-loop.py "install nginx and start it"
```
