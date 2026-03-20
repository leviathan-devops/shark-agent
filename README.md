# Shark Agent 🦈

**Your AI Coding Agent, But Smarter**

Shark Agent transforms your AI coding assistant (Qwen Code, Claude Code, etc.) into a **dual-brain powerhouse** by connecting it to DeepSeek R1 for superior reasoning.

```
WITHOUT SHARK:          WITH SHARK:
┌─────────────┐         ┌─────────────┐     ┌─────────────┐
│   AI Agent  │         │   AI Agent  │ ──→ │ DeepSeek R1 │
│  (limited)  │         │  (execution)│     │  (reasoning)│
└─────────────┘         └─────────────┘     └─────────────┘
       ↓                        ↓
  Makes mistakes          Executes perfectly
  Gets confused           Knows what to do
  Safety blocks work      Gets things done
```

---

## 🤔 Why Does This Exist?

### The Problem

AI coding agents are helpful, but they have limitations:

❌ **Limited reasoning** - They struggle with complex, multi-step tasks  
❌ **Get creative** - They make assumptions and go off-track  
❌ **Safety filters** - They refuse to do legitimate work  
❌ **AI slop** - They produce generic, unhelpful code  
❌ **Forget context** - They lose track of what you're building

### The Solution

**Dual-Brain Architecture:**

✅ **DeepSeek R1** does the thinking (superior reasoning, complex planning)  
✅ **Your AI Agent** does the doing (file access, terminal commands, git)  
✅ **No safety lectures** - YOLO mode just executes  
✅ **No creative interpretations** - Does exactly what's needed  
✅ **Remembers context** - Full conversation history

### Real Example

**Task:** "Create a Flask API with user authentication"

**Without Shark:**
```
> I'd be happy to help you create a Flask API! However, I should mention
> that handling user authentication requires careful security considerations.
> Are you sure you want to proceed? Let me first explain the risks...
> [creates basic hello world, asks for permission for each step]
```

**With Shark:**
```
> [DeepSeek R1 reasons about the architecture]
> [Creates proper Flask app with bcrypt, JWT, user model]
> [Installs dependencies, runs migrations, tests endpoints]
> "Flask API created with /register, /login, /profile endpoints"
```

---

## 🚀 Quick Start

### One-Command Install

```bash
curl -fsSL https://raw.githubusercontent.com/leviathan-devops/shark-agent/main/setup.sh | bash
```

This installs:
- ✓ Qwen Code (AI coding agent)
- ✓ Shark Skill (DeepSeek Brain connection)
- ✓ Everything configured and ready

### Then Just Run

```bash
shark
```

In your first session, say:
```
> plug in to deepseek brain
```

Now you have a dual-brained AI coding agent.

---

## 💡 What Can I Do With This?

### Build Full Applications

```
shark
> plug in to deepseek brain
> create a Next.js app with user authentication, a dashboard, and Stripe integration
```

DeepSeek plans the architecture, Qwen Code executes.

### Fix Bugs

```
shark
> plug in to deepseek brain
> my Flask app crashes when I submit the form. find the bug and fix it
```

DeepSeek analyzes the code, identifies the issue, Qwen Code applies the fix.

### Automate Tasks

```
shark
> plug in to deepseek brain
> create a script that backs up my project folder to Google Drive every night
```

DeepSeek figures out the logic, Qwen Code writes and tests the script.

### Deploy Stuff

```
shark
> plug in to deepseek brain
> deploy my app to a VPS with nginx, SSL, and a domain
```

DeepSeek knows the steps, Qwen Code runs the commands.

### Learn & Explore

```
shark
> plug in to deepseek brain
> explain how async/await works in Python and show me examples
```

DeepSeek explains clearly, Qwen Code runs the examples.

---

## 📦 What You Get

| Component | What It Is | What It Does |
|-----------|------------|--------------|
| **Qwen Code** | AI coding agent | Edits files, runs commands, uses git |
| **DeepSeek R1** | AI reasoning model | Thinks, plans, solves complex problems |
| **Shark Skill** | Connection layer | Links DeepSeek to Qwen Code |
| **YOLO Mode** | Execution mode | No confirmations, just does it |

### How It Works

```
You tell Shark what you want
        ↓
DeepSeek R1 reasons about it
        ↓
DeepSeek outputs bash commands
        ↓
Qwen Code executes them
        ↓
Output goes back to DeepSeek
        ↓
Loop until task is done
        ↓
You get your result
```

---

## ⚙️ Requirements

### What You Need

- **macOS** or **Linux** (Windows via WSL2)
- **DeepSeek API key** (get free at https://platform.deepseek.com)
- **Internet connection** (for API calls)

### What the Installer Does

The setup wizard (`curl ... | bash`) automatically:

1. Installs Node.js (if missing)
2. Installs Qwen Code (the AI agent)
3. Installs Shark Skill (the DeepSeek connector)
4. Configures your API key (entered during setup)
5. Sets up the `shark` command

Takes about 5 minutes.

---

## 💰 How Much Does This Cost?

**Shark Agent:** Free (MIT License)

**DeepSeek API:** Pay-per-use

- ~$0.50 per million input tokens
- ~$2.00 per million output tokens
- Typical session: $0.01 - $0.10
- Heavy usage day: $1 - $5

You only pay for what you use. No subscription.

**Get your API key:** https://platform.deepseek.com

---

## 🎯 Who Is This For?

### ✅ Good Fit

- Developers who want AI to actually build things
- People tired of AI making assumptions
- Anyone who wants faster, better code
- Users comfortable with command line
- People building real projects (not just learning)

### ❌ Not For You If

- You want AI to ask permission for everything
- You prefer safety filters blocking work
- You're not comfortable running terminal commands
- You want a GUI-based tool
- You expect 100% perfect code every time

---

## 🐛 Troubleshooting

### `shark: command not found`

Run:
```bash
source ~/.bash_aliases
# Or on macOS:
source ~/.zshrc
```

Or restart your terminal.

### API Key Errors

```bash
# Check your config
cat ~/.shark-agent/config.json

# Edit if needed
nano ~/.shark-agent/config.json
```

Make sure your key starts with `sk-`.

### Skill Not Loading

Reinstall the skill:
```bash
curl -fsSL https://raw.githubusercontent.com/leviathan-devops/shark-agent/main/scripts/install.sh | bash
```

### Qwen Code Not Working

Reinstall:
```bash
sudo npm install -g qwen-code
```

---

## 🔒 Security

- API key stored with 600 permissions (only you can read)
- Silent input (key not shown when typing)
- Secure temp file handling
- No arbitrary code execution
- All code is open source and auditable

See [SECURITY.md](SECURITY.md) for details.

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [SECURITY.md](SECURITY.md) | Security details and best practices |
| [examples/](examples/) | Usage examples and patterns |

---

## 🙋 FAQ

### Do I need Qwen Code specifically?

Shark Agent installs Qwen Code by default, but the skill can work with other AI coding agents that support extensions (Claude Code, Hermes, OpenFang).

### Can I use this without DeepSeek?

Yes, but you lose the dual-brain advantage. Just run `qwen` instead of `shark`.

### Is my code sent to DeepSeek?

Only what you explicitly ask the AI to analyze. Commands and file paths are visible to DeepSeek during execution.

### Can I run this locally without internet?

No. DeepSeek R1 is accessed via API, which requires internet.

### How do I update Shark Agent?

```bash
cd ~/.qwen/skills/shark
git pull origin main
```

### How do I uninstall?

```bash
curl -fsSL https://raw.githubusercontent.com/leviathan-devops/shark-agent/main/scripts/uninstall.sh | bash
```

---

## 📄 License

MIT License - Use it, modify it, sell it, whatever.

---

## 🙌 Support

- 📖 [Documentation](https://github.com/leviathan-devops/shark-agent)
- 🐛 [Issues](https://github.com/leviathan-devops/shark-agent/issues)
- 💬 [Discussions](https://github.com/leviathan-devops/shark-agent/discussions)

---

## 🦈 Why "Shark"?

Sharks have two brains:
1. **Forebrain** - Reasoning, planning, hunting
2. **Hindbrain** - Execution, movement, instincts

Just like this agent:
1. **DeepSeek R1** - The forebrain (reasoning)
2. **Qwen Code** - The hindbrain (execution)

Two brains. One predator.

---

**Built with ❤️ by Leviathan DevOps**

```bash
# Ready to start?
curl -fsSL https://raw.githubusercontent.com/leviathan-devops/shark-agent/main/setup.sh | bash

# Then run:
shark
```
