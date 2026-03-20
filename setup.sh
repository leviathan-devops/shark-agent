#!/bin/bash
# Shark Agent - Complete Setup Wizard (macOS + Linux Compatible)
# Installs Qwen Code + Shark Skill + DeepSeek Brain Integration
# Usage: curl -fsSL https://raw.githubusercontent.com/leviathan-devops/shark-agent/main/setup.sh | bash

set -euo pipefail

# Colors - work on both macOS and Linux
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    MAGENTA='\033[0;35m'
    CYAN='\033[0;36m'
    NC='\033[0m'
else
    # Linux
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    MAGENTA='\033[0;35m'
    CYAN='\033[0;36m'
    NC='\033[0m'
fi

# Configuration
SHARK_SKILL_DIR="$HOME/.qwen/skills/shark"
CONFIG_DIR="$HOME/.shark-agent"
BASH_ALIASES="$HOME/.bash_aliases"
REPO_URL="https://github.com/leviathan-devops/shark-agent.git"
BRANCH="main"

# Helper function for colored output (works on macOS + Linux)
print_color() {
    printf "%b\n" "$1"
}

echo ""
echo "+==========================================================+"
echo "|                                                          |"
echo "|         SHARK AGENT - SETUP WIZARD                       |"
echo "|                                                          |"
echo "|     Complete Dual-Brain AI Coding Agent Setup            |"
echo "|                                                          |"
echo "|     Qwen Code + DeepSeek R1 = Autonomous Coding          |"
echo "|                                                          |"
echo "+==========================================================+"
echo ""

# Detect OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    print_color "${BLUE}Detected: macOS${NC}"
    OS_NAME="macOS"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    print_color "${BLUE}Detected: Linux${NC}"
    OS_NAME="Linux"
else
    print_color "${YELLOW}Unknown OS: $OSTYPE (will try generic install)${NC}"
    OS_NAME="Unknown"
fi
echo ""

# Check if running interactively
INTERACTIVE=false
if [ -t 0 ]; then
    INTERACTIVE=true
fi

# Security notice
print_color "${YELLOW}SECURITY NOTICE:${NC}"
echo "This script will:"
echo "  • Install Node.js packages (Qwen Code)"
echo "  • Clone GitHub repositories"
echo "  • Store API keys locally"
echo ""
echo "For maximum security, download and verify before running:"
echo "  curl -fsSL https://raw.githubusercontent.com/leviathan-devops/shark-agent/main/setup.sh > setup.sh"
echo "  sha256sum setup.sh  # Compare with published checksum"
echo "  bash setup.sh"
echo ""

if $INTERACTIVE; then
    read -p "Continue with installation? [Y/n] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_color "${YELLOW}Installation cancelled.${NC}"
        exit 0
    fi
else
    print_color "${YELLOW}Non-interactive mode: continuing automatically${NC}"
fi

echo ""
print_color "${BLUE}═══════════════════════════════════════════════════════════${NC}"
print_color "${BLUE}Step 1/7: Checking requirements...${NC}"
print_color "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Node.js
if ! command -v node &> /dev/null; then
    print_color "${YELLOW}Installing Node.js...${NC}"
    if [[ "$OS_NAME" == "macOS" ]]; then
        if command -v brew &> /dev/null; then
            brew install node
        else
            print_color "${RED}Homebrew not found. Please install from https://brew.sh${NC}"
            exit 1
        fi
    elif command -v apt &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif command -v yum &> /dev/null; then
        curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo -E bash -
        sudo yum install -y nodejs
    elif command -v pacman &> /dev/null; then
        sudo pacman -S nodejs npm --noconfirm
    else
        print_color "${RED}Please install Node.js from https://nodejs.org${NC}"
        exit 1
    fi
fi
print_color "${GREEN}✓${NC} Node.js: $(node -v)"

# npm
if ! command -v npm &> /dev/null; then
    print_color "${RED}✗ npm required${NC}"
    exit 1
fi
print_color "${GREEN}✓${NC} npm: $(npm -v)"

# Python
if ! command -v python3 &> /dev/null; then
    print_color "${RED}✗ Python 3 required${NC}"
    exit 1
fi
print_color "${GREEN}✓${NC} Python 3: $(python3 --version)"

# git
if ! command -v git &> /dev/null; then
    print_color "${YELLOW}Installing git...${NC}"
    if [[ "$OS_NAME" == "macOS" ]]; then
        brew install git
    elif command -v apt &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y git
    elif command -v yum &> /dev/null; then
        sudo yum install -y git
    fi
fi
print_color "${GREEN}✓${NC} git installed"

echo ""
print_color "${BLUE}═══════════════════════════════════════════════════════════${NC}"
print_color "${BLUE}Step 2/7: Installing Qwen Code...${NC}"
print_color "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Check npm registry config (normalize trailing slashes)
NPM_REGISTRY=$(npm config get registry 2>/dev/null | sed 's:/*$::' || echo "https://registry.npmjs.org")
if [[ "$NPM_REGISTRY" != "https://registry.npmjs.org" ]]; then
    print_color "${YELLOW}WARNING: Custom npm registry detected: $NPM_REGISTRY${NC}"
    print_color "${YELLOW}Using official registry is recommended for security${NC}"
    if $INTERACTIVE; then
        read -p "Continue anyway? [y/N] " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_color "${RED}Please configure npm to use official registry:${NC}"
            echo "  npm config set registry https://registry.npmjs.org"
            exit 1
        fi
    else
        print_color "${YELLOW}Non-interactive: continuing with custom registry${NC}"
    fi
else
    print_color "${GREEN}✓${NC} npm registry: official"
fi

print_color "${YELLOW}Installing Qwen Code globally...${NC}"

# Try official package only - no fallbacks to arbitrary repos
if sudo npm install -g @anthropics/qwen-code 2>/dev/null; then
    print_color "${GREEN}✓${NC} Qwen Code installed from official package"
elif sudo npm install -g qwen-code 2>/dev/null; then
    print_color "${GREEN}✓${NC} Qwen Code installed (alternative package)"
else
    print_color "${RED}✗ Qwen Code installation failed${NC}"
    echo ""
    print_color "${YELLOW}Please install manually:${NC}"
    echo "  sudo npm install -g @anthropics/qwen-code"
    echo ""
    echo "Or check: https://github.com/QwenLM/qwen-code"
    exit 1
fi

if command -v qwen &> /dev/null; then
    print_color "${GREEN}✓${NC} Qwen Code: $(qwen --version 2>/dev/null || echo installed)"
else
    print_color "${RED}✗ qwen command not found after install${NC}"
    exit 1
fi

echo ""
print_color "${BLUE}═══════════════════════════════════════════════════════════${NC}"
print_color "${BLUE}Step 3/7: Installing Shark Skill...${NC}"
print_color "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Backup existing
if [ -d "$SHARK_SKILL_DIR" ]; then
    print_color "${YELLOW}Backing up existing skill...${NC}"
    BACKUP_NAME="$SHARK_SKILL_DIR.backup.$(date +%s)"
    mv "$SHARK_SKILL_DIR" "$BACKUP_NAME"
    print_color "${GREEN}✓${NC} Backup: $BACKUP_NAME"
fi

# Use secure temp directory
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT ERR INT TERM

print_color "${YELLOW}Cloning Shark Agent repository...${NC}"
if ! git clone --depth 1 -b "$BRANCH" "$REPO_URL" "$TEMP_DIR/shark" 2>/dev/null; then
    print_color "${RED}✗ Failed to clone repository${NC}"
    exit 1
fi

# Verify expected files exist before copying
if [ ! -f "$TEMP_DIR/shark/skills/shark/run.py" ]; then
    print_color "${RED}✗ Expected skill files not found${NC}"
    print_color "${YELLOW}Repository structure may have changed${NC}"
    exit 1
fi

# Install skill - clean copy
mkdir -p "$(dirname "$SHARK_SKILL_DIR")"
cp -r "$TEMP_DIR/shark/skills/shark" "$SHARK_SKILL_DIR"

# Set secure permissions on Python files only
find "$SHARK_SKILL_DIR" -name "*.py" -exec chmod 755 {} \; 2>/dev/null || true

print_color "${GREEN}✓${NC} Shark skill installed"

echo ""
print_color "${BLUE}═══════════════════════════════════════════════════════════${NC}"
print_color "${BLUE}Step 4/7: Python dependencies...${NC}"
print_color "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

if ! python3 -c "import requests" &> /dev/null; then
    print_color "${YELLOW}Installing requests...${NC}"
    if pip install requests --break-system-packages -q 2>/dev/null; then
        print_color "${GREEN}✓${NC} Installed via pip"
    elif pip3 install requests -q 2>/dev/null; then
        print_color "${GREEN}✓${NC} Installed via pip3"
    elif sudo pip install requests -q 2>/dev/null; then
        print_color "${GREEN}✓${NC} Installed via sudo pip"
    else
        print_color "${YELLOW}Install manually: pip install requests${NC}"
    fi
fi
print_color "${GREEN}✓${NC} Dependencies ready"

echo ""
print_color "${BLUE}═══════════════════════════════════════════════════════════${NC}"
print_color "${BLUE}Step 5/7: DeepSeek API configuration...${NC}"
print_color "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

mkdir -p "$CONFIG_DIR"

# Secure directory permissions
chmod 700 "$CONFIG_DIR"

if [ ! -f "$CONFIG_DIR/config.json" ]; then
    print_color "${CYAN}DeepSeek API Key Required${NC}"
    echo ""
    echo "Get your key: https://platform.deepseek.com"
    print_color "${YELLOW}Your key will be stored in: $CONFIG_DIR/config.json${NC}"
    print_color "${YELLOW}File permissions: 600 (only you can read)${NC}"
    echo ""

    # Try to get API key from environment first
    if [ -n "$DEEPSEEK_API_KEY" ]; then
        API_KEY="$DEEPSEEK_API_KEY"
        print_color "${GREEN}✓${NC} Using API key from environment"
    else
        # Interactive prompt - works on all systems
        print_color "${YELLOW}Enter your DeepSeek API key:${NC}"
        echo -n "Key: "
        read API_KEY
        echo ""
    fi

    if [ -z "$API_KEY" ]; then
        print_color "${RED}✗ API key required${NC}"
        echo ""
        print_color "${YELLOW}Get your key at: https://platform.deepseek.com${NC}"
        echo ""
        echo "Or set environment variable and re-run:"
        echo "  export DEEPSEEK_API_KEY=sk-xxx"
        echo "  bash setup.sh"
        exit 1
    fi

    # Validate API key format (should start with sk-)
    if [[ ! "$API_KEY" =~ ^sk-[a-zA-Z0-9]+$ ]]; then
        print_color "${RED}✗ Invalid API key format${NC}"
        echo "Expected format: sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
        exit 1
    fi

    # Create config with secure permissions
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

    # Secure file permissions (owner read/write only)
    chmod 600 "$CONFIG_DIR/config.json"

    print_color "${GREEN}✓${NC} Config saved with secure permissions (600)"
else
    print_color "${GREEN}✓${NC} Config exists"
    print_color "${YELLOW}To update API key, edit: $CONFIG_DIR/config.json${NC}"
fi

# Verify config permissions (works on macOS + Linux)
if command -v stat &> /dev/null; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS stat
        CONFIG_PERMS=$(stat -f %A "$CONFIG_DIR/config.json" 2>/dev/null || echo "unknown")
    else
        # Linux stat
        CONFIG_PERMS=$(stat -c %a "$CONFIG_DIR/config.json" 2>/dev/null || echo "unknown")
    fi
    if [[ "$CONFIG_PERMS" != "600" ]]; then
        print_color "${YELLOW}WARNING: Config file permissions are $CONFIG_PERMS (should be 600)${NC}"
        chmod 600 "$CONFIG_DIR/config.json"
        print_color "${GREEN}✓${NC} Fixed permissions to 600"
    fi
fi

echo ""
print_color "${BLUE}═══════════════════════════════════════════════════════════${NC}"
print_color "${BLUE}Step 6/7: Setting up aliases...${NC}"
print_color "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Detect shell config file
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS - check for zsh (default) or bash
    if [[ -n "$ZSH_VERSION" ]] || [[ "$SHELL" == *"zsh"* ]]; then
        SHELL_CONFIG="$HOME/.zshrc"
    else
        SHELL_CONFIG="$BASH_ALIASES"
    fi
else
    # Linux
    SHELL_CONFIG="$BASH_ALIASES"
fi

touch "$SHELL_CONFIG"

if ! grep -q "alias shark=" "$SHELL_CONFIG" 2>/dev/null; then
    cat >> "$SHELL_CONFIG" << 'EOF'

# Shark Agent - Dual Brain Qwen Code
alias shark='qwen --yolo'
alias shark-test='python3 ~/.qwen/skills/shark/run.py "say hello and run: echo shark works"'
EOF
    print_color "${GREEN}✓${NC} Added 'shark' alias to $SHELL_CONFIG"
else
    print_color "${GREEN}✓${NC} 'shark' alias exists"
fi

if ! grep -q "alias qwen=" "$SHELL_CONFIG" 2>/dev/null; then
    echo "alias qwen='qwen --yolo'" >> "$SHELL_CONFIG"
    print_color "${GREEN}✓${NC} Default YOLO mode for qwen"
fi

echo ""
print_color "${BLUE}═══════════════════════════════════════════════════════════${NC}"
print_color "${BLUE}Step 7/7: Security verification...${NC}"
print_color "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Verify installations
ERRORS=0

if ! command -v qwen &> /dev/null; then
    print_color "${RED}✗ qwen command not found${NC}"
    ERRORS=$((ERRORS + 1))
fi

if [ ! -d "$SHARK_SKILL_DIR" ]; then
    print_color "${RED}✗ Shark skill directory not found${NC}"
    ERRORS=$((ERRORS + 1))
fi

if [ ! -f "$CONFIG_DIR/config.json" ]; then
    print_color "${RED}✗ Config file not found${NC}"
    ERRORS=$((ERRORS + 1))
fi

if [ $ERRORS -gt 0 ]; then
    echo ""
    print_color "${RED}Installation completed with $ERRORS error(s)${NC}"
    print_color "${YELLOW}Please review the errors above${NC}"
    exit 1
fi

print_color "${GREEN}✓${NC} All components verified"

echo ""
print_color "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
print_color "${GREEN}║                                                          ║${NC}"
print_color "${GREEN}║        🎉 SHARK AGENT SETUP COMPLETE! 🎉                 ║${NC}"
print_color "${GREEN}║                                                          ║${NC}"
print_color "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
print_color "${CYAN}Installed:${NC}"
echo "  ✓ Qwen Code"
echo "  ✓ Shark Skill (DeepSeek Brain)"
echo "  ✓ Dual-Brain architecture"
echo "  ✓ One-command launch"
echo ""
print_color "${CYAN}Usage:${NC}"
echo ""
print_color "  ${GREEN}shark${NC}              → Launch Dual-Brain Qwen Code"
print_color "  ${GREEN}qwen${NC}               → Launch Qwen Code (YOLO)"
print_color "  ${GREEN}shark-test${NC}         → Test installation"
echo ""
print_color "${CYAN}In your first session:${NC}"
echo '  "plug in to deepseek brain"'
echo ""
print_color "${YELLOW}Quick test:${NC}"
echo "  Run: shark-test"
echo ""
print_color "${BLUE}Docs: https://github.com/leviathan-devops/shark-agent${NC}"
echo ""
print_color "${MAGENTA}═══════════════════════════════════════════════════════════${NC}"
print_color "${MAGENTA}Ready? Type: ${GREEN}shark${MAGENTA}${NC}"
print_color "${MAGENTA}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Don't source automatically - let user do it
print_color "${YELLOW}To activate aliases, run:${NC}"
if [[ "$OSTYPE" == "darwin"* ]] && [[ -n "$ZSH_VERSION" ]]; then
    echo "  source ~/.zshrc"
else
    echo "  source ~/.bash_aliases"
fi
echo ""
print_color "${YELLOW}Or restart your terminal${NC}"
echo ""
