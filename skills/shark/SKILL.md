---
name: shark
description: Shark Agent - DeepSeek R1 reasoning with coding agent execution. Works with Qwen Code, Claude Code, Hermes, OpenFang, etc. Triggers include "plug in to deepseek brain", "use deepseek", "shark mode".
allowed-tools: Bash(python3 ~/.qwen/skills/shark/*)
---

# Shark Agent - Dual Brain Architecture

**DeepSeek R1** = Reasoning engine (smarter, better at complex tasks)
**Your Coding Agent** = Execution hands (full device access, YOLO mode)

## Quick Start

```bash
# One-shot command
python3 ~/.qwen/skills/shark/run.py "create a flask app"

# Reset context and start fresh
python3 ~/.qwen/skills/shark/run.py --reset "new task"

# Interactive terminal mode
python3 ~/.qwen/skills/shark/shark-brain.py

# Or use aliases
shark "task"
shark-brain  # interactive
```

## How It Works

1. User gives task to coding agent
2. Coding agent forwards to DeepSeek R1 via Shark
3. DeepSeek R1 reasons and outputs bash commands in ```bash blocks
4. Coding agent executes commands automatically (YOLO mode)
5. Output sent back to DeepSeek
6. Loop continues until task complete

## Example Usage

**User:** "plug in to deepseek brain - create a hello world API"

**DeepSeek responds:**
```bash
mkdir hello-api && cd hello-api
cat > app.py << 'EOF'
from flask import Flask
app = Flask(__name__)

@app.route('/')
def hello():
    return "Hello, World!"

if __name__ == '__main__':
    app.run()
EOF
pip install flask -q
```

**Output:** Flask app created and ready to run.

## Commands

| Command | Description |
|---------|-------------|
| `run.py "task"` | Execute task with auto-run |
| `run.py --reset "task"` | Fresh context |
| `shark-brain.py` | Interactive mode |
| `shark-loop.py "task"` | Full loop executor |

## Configuration

- **API Key:** `sk-YOUR_API_KEY_HERE`
- **History:** `/tmp/shark-history.json`
- **Model:** `deepseek-reasoner`
- **Timeout:** 300s API, 300s commands

## Troubleshooting

**API errors:** Check API key validity
**Timeout:** Commands have 300s timeout
**History stuck:** `rm /tmp/shark-history.json`

## Compatible Agents

- Qwen Code (tested ✓)
- Claude Code
- Hermes
- OpenFang
- Any agent with skill/extension support
