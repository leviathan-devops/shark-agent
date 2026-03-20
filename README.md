# Shark Agent 🦈

**The Complete Dual-Brain AI Coding Agent**

One command installs everything: Qwen Code + DeepSeek R1 + autonomous coding.

```bash
curl -fsSL https://raw.githubusercontent.com/leviathan-devops/shark-agent/main/setup.sh | bash
```

Then run:
```bash
shark
```

That's it. You now have a fully autonomous dual-brained AI coding agent.

---

## 🚀 What You Get

| Component | What It Does |
|-----------|--------------|
| **Qwen Code** | Full AI coding agent (files, terminal, git) |
| **DeepSeek R1** | Superior reasoning (via Shark Skill) |
| **YOLO Mode** | No confirmations, just execution |
| **Dual-Brain** | DeepSeek thinks, Qwen executes |

---

## 📦 Install

### One-Command Setup

```bash
curl -fsSL https://raw.githubusercontent.com/leviathan-devops/shark-agent/main/setup.sh | bash
```

The wizard installs:
- ✓ Qwen Code (AI coding agent)
- ✓ Shark Skill (DeepSeek Brain integration)
- ✓ Dual-Brain architecture
- ✓ `shark` command

### Manual Install

```bash
# 1. Install Qwen Code
sudo npm install -g qwen-code

# 2. Install Shark Skill
git clone https://github.com/leviathan-devops/shark-agent.git /tmp/shark
cp -r /tmp/shark/skills/shark ~/.qwen/skills/
rm -rf /tmp/shark

# 3. Install Python deps
pip install requests

# 4. Add alias
echo "alias shark='qwen --yolo'" >> ~/.bash_aliases
source ~/.bash_aliases

# 5. Configure API key
mkdir -p ~/.shark-agent
cat > ~/.shark-agent/config.json << 'EOF'
{
  "api_key": "sk-your-key-here",
  "model": "deepseek-reasoner"
}
EOF

# 6. Run
shark
```

---

## 💻 Usage

### Launch

```bash
shark
```

### First Session

```
> plug in to deepseek brain

> create a Flask API with user authentication

> add a React frontend

> deploy to production
```

### Commands

| Command | Description |
|---------|-------------|
| `shark` | Launch Dual-Brain Qwen Code |
| `qwen` | Launch Qwen Code (YOLO mode) |
| `shark-test` | Test installation |

---

## ⚙️ Configuration

### API Key

Get DeepSeek API key: https://platform.deepseek.com

Config file: `~/.shark-agent/config.json`

```json
{
  "api_key": "sk-your-key-here",
  "model": "deepseek-reasoner",
  "timeout": 120,
  "yolo_mode": true
}
```

---

## 🎯 Use Cases

### Full Stack Development
```
shark
> plug in to deepseek brain
> create a Next.js app with auth, database, and API
```

### System Admin
```
shark
> plug in to deepseek brain
> set up nginx with SSL and deploy my app
```

### Data Analysis
```
shark
> plug in to deepseek brain
> analyze this CSV and create visualizations
```

---

## 🔧 Requirements

The setup wizard installs everything:
- Node.js 18+ (for Qwen Code)
- Python 3.8+ (for Shark Skill)
- npm
- git

**OS:** Linux, macOS, Windows (WSL2)

---

## 🐛 Troubleshooting

### `shark` not found
```bash
source ~/.bash_aliases
# Or restart terminal
```

### API errors
```bash
nano ~/.shark-agent/config.json
# Update API key
```

### Skill not loading
```bash
curl -fsSL https://raw.githubusercontent.com/leviathan-devops/shark-agent/main/scripts/install-skill.sh | bash
```

---

## 📄 License

MIT License

---

## 🙌 Support

- 📖 [Docs](https://github.com/leviathan-devops/shark-agent)
- 🐛 [Issues](https://github.com/leviathan-devops/shark-agent/issues)

---

**Built with ❤️ by Leviathan DevOps**

```bash
# Install
curl -fsSL https://raw.githubusercontent.com/leviathan-devops/shark-agent/main/setup.sh | bash

# Run
shark
```
