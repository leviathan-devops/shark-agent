#!/bin/bash
# Shark Agent - Complete Setup Wizard
# Installs Qwen Code + Shark Skill + DeepSeek Brain Integration
# Usage: curl -fsSL https://raw.githubusercontent.com/leviathan-devops/shark-agent/main/setup.sh | bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
SHARK_SKILL_DIR="$HOME/.qwen/skills/shark"
CONFIG_DIR="$HOME/.shark-agent"
BASH_ALIASES="$HOME/.bash_aliases"

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                                                          ║${NC}"
echo -e "${CYAN}║           🦈 SHARK AGENT - SETUP WIZARD 🦈                ║${NC}"
echo -e "${CYAN}║                                                          ║${NC}"
echo -e "${CYAN}║     Complete Dual-Brain AI Coding Agent Setup            ║${NC}"
echo -e "${CYAN}║                                                          ║${NC}"
echo -e "${CYAN}║     Qwen Code + DeepSeek R1 = Autonomous Coding          ║${NC}"
echo -e "${CYAN}║                                                          ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Welcome
echo -e "${BLUE}Welcome to Shark Agent Setup!${NC}"
echo ""
echo "This wizard installs:"
echo "  ✓ Qwen Code (AI coding agent)"
echo "  ✓ Shark Skill (DeepSeek Brain integration)"
echo "  ✓ Dual-Brain architecture"
echo "  ✓ One-command launch (shark)"
echo ""
echo "Time: ~5 minutes"
echo ""
read -p "Continue? [Y/n] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Setup cancelled.${NC}"
    exit 0
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Step 1/6: Checking requirements...${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Node.js
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Installing Node.js...${NC}"
    if command -v apt &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif command -v yum &> /dev/null; then
        curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo -E bash -
        sudo yum install -y nodejs
    elif command -v pacman &> /dev/null; then
        sudo pacman -S nodejs npm
    else
        echo -e "${RED}Please install Node.js from https://nodejs.org${NC}"
        exit 1
    fi
fi
echo -e "${GREEN}✓${NC} Node.js: $(node -v)"

# npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}✗ npm required${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC} npm: $(npm -v)"

# Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}✗ Python 3 required${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC} Python 3: $(python3 --version)"

# git
if ! command -v git &> /dev/null; then
    echo -e "${YELLOW}Installing git...${NC}"
    if command -v apt &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y git
    elif command -v yum &> /dev/null; then
        sudo yum install -y git
    fi
fi
echo -e "${GREEN}✓${NC} git installed"

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Step 2/6: Installing Qwen Code...${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}Installing Qwen Code globally...${NC}"
sudo npm install -g @anthropics/qwen-code 2>/dev/null || \
sudo npm install -g qwen-code 2>/dev/null || \
sudo npm install -g @qwen-code/qwen-code 2>/dev/null || {
    echo -e "${YELLOW}Trying alternative install...${NC}"
    git clone --depth 1 https://github.com/QwenLM/qwen-code.git /tmp/qwen-code
    cd /tmp/qwen-code
    npm install
    sudo npm link
    cd -
    rm -rf /tmp/qwen-code
}

if command -v qwen &> /dev/null; then
    echo -e "${GREEN}✓${NC} Qwen Code: $(qwen --version 2>/dev/null || echo installed)"
else
    echo -e "${RED}✗ Qwen Code install failed${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Step 3/6: Installing Shark Skill...${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Backup existing
if [ -d "$SHARK_SKILL_DIR" ]; then
    echo -e "${YELLOW}Backing up existing skill...${NC}"
    mv "$SHARK_SKILL_DIR" "$SHARK_SKILL_DIR.backup.$(date +%s)"
fi

# Clone repo
echo -e "${YELLOW}Cloning Shark Agent...${NC}"
git clone --depth 1 https://github.com/leviathan-devops/shark-agent.git /tmp/shark-temp

# Install skill
mkdir -p "$(dirname "$SHARK_SKILL_DIR")"
cp -r /tmp/shark-temp/skills/shark "$SHARK_SKILL_DIR"
rm -rf /tmp/shark-temp

chmod +x "$SHARK_SKILL_DIR"/*.py 2>/dev/null || true
echo -e "${GREEN}✓${NC} Shark skill installed"

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Step 4/6: Python dependencies...${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

if ! python3 -c "import requests" &> /dev/null; then
    echo -e "${YELLOW}Installing requests...${NC}"
    pip install requests --break-system-packages -q 2>/dev/null || \
    pip install requests -q 2>/dev/null || \
    pip3 install requests -q 2>/dev/null || {
        echo -e "${YELLOW}Install manually: pip install requests${NC}"
    }
fi
echo -e "${GREEN}✓${NC} Dependencies ready"

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Step 5/6: DeepSeek API configuration...${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

mkdir -p "$CONFIG_DIR"

if [ ! -f "$CONFIG_DIR/config.json" ]; then
    echo -e "${CYAN}DeepSeek API Key Required${NC}"
    echo ""
    echo "Get your key: https://platform.deepseek.com"
    echo ""
    read -p "Enter your DeepSeek API key: " API_KEY
    
    if [ -z "$API_KEY" ]; then
        echo -e "${RED}✗ API key required${NC}"
        exit 1
    fi
    
    cat > "$CONFIG_DIR/config.json" << EOF
{
  "api_key": "$API_KEY",
  "model": "deepseek-reasoner",
  "timeout": 120,
  "max_loops": 10,
  "yolo_mode": true,
  "verbose": false
}
EOF
    echo -e "${GREEN}✓${NC} Config saved"
else
    echo -e "${GREEN}✓${NC} Config exists"
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Step 6/6: Setting up aliases...${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

touch "$BASH_ALIASES"

if ! grep -q "alias shark=" "$BASH_ALIASES" 2>/dev/null; then
    cat >> "$BASH_ALIASES" << 'EOF'

# Shark Agent - Dual Brain Qwen Code
alias shark='qwen --yolo'
alias shark-test='python3 ~/.qwen/skills/shark/run.py "say hello and run: echo shark works"'
EOF
    echo -e "${GREEN}✓${NC} Added 'shark' alias"
else
    echo -e "${GREEN}✓${NC} 'shark' alias exists"
fi

if ! grep -q "alias qwen=" "$BASH_ALIASES" 2>/dev/null; then
    echo "alias qwen='qwen --yolo'" >> "$BASH_ALIASES"
    echo -e "${GREEN}✓${NC} Default YOLO mode for qwen"
fi

if [ -n "$PS1" ]; then
    source "$BASH_ALIASES" 2>/dev/null || true
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                          ║${NC}"
echo -e "${GREEN}║        🎉 SHARK AGENT SETUP COMPLETE! 🎉                 ║${NC}"
echo -e "${GREEN}║                                                          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Installed:${NC}"
echo "  ✓ Qwen Code"
echo "  ✓ Shark Skill (DeepSeek Brain)"
echo "  ✓ Dual-Brain architecture"
echo "  ✓ One-command launch"
echo ""
echo -e "${CYAN}Usage:${NC}"
echo ""
echo -e "  ${GREEN}shark${NC}              → Launch Dual-Brain Qwen Code"
echo -e "  ${GREEN}qwen${NC}               → Launch Qwen Code (YOLO)"
echo -e "  ${GREEN}shark-test${NC}         → Test installation"
echo ""
echo -e "${CYAN}In your first session:${NC}"
echo '  "plug in to deepseek brain"'
echo ""
echo -e "${YELLOW}Quick test:${NC}"
echo "  Run: shark-test"
echo ""
echo -e "${BLUE}Docs: https://github.com/leviathan-devops/shark-agent${NC}"
echo ""
echo -e "${MAGENTA}═══════════════════════════════════════════════════════════${NC}"
echo -e "${MAGENTA}Ready? Type: ${GREEN}shark${MAGENTA}${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════════════════════════${NC}"
echo ""
