# Dual Brain Shark 🦈

**Qwen Code + DeepSeek R1 = Dual Brain Architecture**

DeepSeek R1 provides the reasoning. Qwen Code provides the execution. Together, they form a powerful AI agent with full device access.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Python](https://img.shields.io/badge/python-3.8+-blue)

---

## 🚀 Quick Start

### One-Line Install

```bash
curl -fsSL https://raw.githubusercontent.com/leviathan-devops/dual-brain-shark/main/scripts/install.sh | bash
```

### Manual Install

```bash
git clone https://github.com/leviathan-devops/dual-brain-shark.git
cd dual-brain-shark
./scripts/install.sh
```

### Usage

```bash
# In Qwen Code chat, say:
"plug in to deepseek brain"

# Or run directly:
shark "create a flask API"
shark-brain  # interactive mode
```

---

## 🦈 What Is This?

This is the **deliverable** for the Dual Brain Shark agent system - a dual-brain architecture for AI-powered task execution.

### The Architecture

- **DeepSeek R1** = The BRAIN (reasoning, planning, complex tasks)
- **Qwen Code** = The HANDS (execution, file access, command execution)

### How It Works

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

---

## 📦 What's Included

```
dual-brain-shark/
├── skills/shark/           # The skill files
│   ├── SKILL.md            # Skill definition
│   ├── skill.json          # Manifest
│   ├── run.py              # Main entry point
│   ├── shark-brain.py      # Interactive mode
│   ├── shark-loop.py       # Full auto-execute loop
│   └── shark-client.py     # API client
├── scripts/
│   ├── install.sh          # One-line installer
│   └── uninstall.sh        # Clean removal
├── docs/
│   ├── ARCHITECTURE.md     # Technical deep dive
│   └── CONFIGURATION.md    # Settings reference
├── examples/
│   └── 01-basic-usage.md   # Usage examples
├── README.md
├── LICENSE
└── .env.example
```

---

## 🎯 Use Cases

### Web Development
```bash
shark "create a Next.js app with Tailwind CSS and user authentication"
```

### Data Processing
```bash
shark "analyze this CSV and create visualizations for the top 10 trends"
```

### System Administration
```bash
shark "set up nginx with SSL, configure firewall, and deploy my app"
```

### Code Refactoring
```bash
shark "refactor this Python codebase to use async/await and add type hints"
```

### Debugging
```bash
shark "find why my Flask app is crashing and fix it"
```

---

## ⚙️ Configuration

### Environment Variables

```bash
# Required: Your DeepSeek API key
export DEEPSEEK_API_KEY="sk-your-key-here"

# Optional: Custom settings
export DEEPSEEK_HISTORY_FILE="/tmp/shark-history.json"
export DEEPSEEK_MODEL="deepseek-reasoner"
export DEEPSEEK_TIMEOUT="120"
```

### Configuration File

Create `~/.dual-brain-shark/config.json`:

```json
{
  "api_key": "sk-your-key-here",
  "model": "deepseek-reasoner",
  "timeout": 120,
  "max_loops": 10,
  "yolo_mode": true
}
```

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Technical deep dive |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | Advanced settings |
| [examples/](examples/) | Usage examples |

---

## 🔧 Development

### Building from Source

```bash
git clone https://github.com/leviathan-devops/dual-brain-shark.git
cd dual-brain-shark
pip install -r requirements.txt
./scripts/install.sh --dev
```

### Running Tests

```bash
./scripts/test.sh
```

---

## 📄 License

MIT License - See [LICENSE](LICENSE) for details.

---

## 🙋 Support

### Common Issues

**Skill not loading:**
```bash
./scripts/uninstall.sh && ./scripts/install.sh
```

**API errors:**
```bash
curl -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
  https://api.deepseek.com/v1/models
```

### Getting Help

- 📖 Read the [documentation](docs/)
- 🐛 Open an [issue](https://github.com/leviathan-devops/dual-brain-shark/issues)

---

**Built with ❤️ by Leviathan DevOps**

```bash
# Ready to start?
curl -fsSL https://raw.githubusercontent.com/leviathan-devops/dual-brain-shark/main/scripts/install.sh | bash
```
