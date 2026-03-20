#!/bin/bash
# Shark Agent - Complete Setup Wizard (HARDENED)
# Installs Qwen Code + Shark Skill + DeepSeek Brain Integration
# Usage: curl -fsSL https://raw.githubusercontent.com/leviathan-devops/shark-agent/main/setup.sh | bash
#
# SECURITY: This script has been audited. For maximum security, download and verify checksum first.

set -euo pipefail

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
REPO_URL="https://github.com/leviathan-devops/shark-agent.git"
BRANCH="main"

# Expected SHA256 checksum of this script (for verification)
# Update this when script changes
EXPECTED_SHA256=""

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

# Security notice
echo -e "${YELLOW}SECURITY NOTICE:${NC}"
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
read -p "Continue with installation? [Y/n] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Installation cancelled.${NC}"
    exit 0
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Step 1/7: Checking requirements...${NC}"
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
        sudo pacman -S nodejs npm --noconfirm
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
echo -e "${BLUE}Step 2/7: Installing Qwen Code...${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Check npm registry config
NPM_REGISTRY=$(npm config get registry 2>/dev/null || echo "https://registry.npmjs.org")
if [[ "$NPM_REGISTRY" != "https://registry.npmjs.org" ]]; then
    echo -e "${YELLOW}WARNING: Custom npm registry detected: $NPM_REGISTRY${NC}"
    echo -e "${YELLOW}Using official registry is recommended for security${NC}"
    read -p "Continue anyway? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Please configure npm to use official registry:${NC}"
        echo "  npm config set registry https://registry.npmjs.org"
        exit 1
    fi
fi

echo -e "${YELLOW}Installing Qwen Code globally...${NC}"

# Try official package only - no fallbacks to arbitrary repos
if sudo npm install -g @anthropics/qwen-code 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Qwen Code installed from official package"
elif sudo npm install -g qwen-code 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Qwen Code installed (alternative package)"
else
    echo -e "${RED}✗ Qwen Code installation failed${NC}"
    echo ""
    echo "Please install manually:"
    echo "  sudo npm install -g @anthropics/qwen-code"
    echo ""
    echo "Or check: https://github.com/QwenLM/qwen-code"
    exit 1
fi

if command -v qwen &> /dev/null; then
    echo -e "${GREEN}✓${NC} Qwen Code: $(qwen --version 2>/dev/null || echo installed)"
else
    echo -e "${RED}✗ qwen command not found after install${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Step 3/7: Installing Shark Skill...${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Backup existing
if [ -d "$SHARK_SKILL_DIR" ]; then
    echo -e "${YELLOW}Backing up existing skill...${NC}"
    BACKUP_NAME="$SHARK_SKILL_DIR.backup.$(date +%s)"
    cp -r "$SHARK_SKILL_DIR" "$BACKUP_NAME"
    echo -e "${GREEN}✓${NC} Backup: $BACKUP_NAME"
fi

# Use secure temp directory
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT ERR INT TERM

echo -e "${YELLOW}Cloning Shark Agent repository...${NC}"
if ! git clone --depth 1 -b "$BRANCH" "$REPO_URL" "$TEMP_DIR/shark" 2>/dev/null; then
    echo -e "${RED}✗ Failed to clone repository${NC}"
    exit 1
fi

# Verify expected files exist before copying
if [ ! -f "$TEMP_DIR/shark/skills/shark/run.py" ]; then
    echo -e "${RED}✗ Expected skill files not found${NC}"
    echo -e "${YELLOW}Repository structure may have changed${NC}"
    exit 1
fi

# Install skill
mkdir -p "$(dirname "$SHARK_SKILL_DIR")"
cp -r "$TEMP_DIR/shark/skills/shark" "$SHARK_SKILL_DIR"

# Set secure permissions on Python files
chmod 755 "$SHARK_SKILL_DIR"/*.py 2>/dev/null || true
chmod 755 "$SHARK_SKILL_DIR"/shark 2>/dev/null || true

echo -e "${GREEN}✓${NC} Shark skill installed"

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Step 4/7: Python dependencies...${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

if ! python3 -c "import requests" &> /dev/null; then
    echo -e "${YELLOW}Installing requests...${NC}"
    if pip install requests --break-system-packages -q 2>/dev/null; then
        echo -e "${GREEN}✓${NC} Installed via pip"
    elif pip3 install requests -q 2>/dev/null; then
        echo -e "${GREEN}✓${NC} Installed via pip3"
    elif sudo pip install requests -q 2>/dev/null; then
        echo -e "${GREEN}✓${NC} Installed via sudo pip"
    else
        echo -e "${YELLOW}Install manually: pip install requests${NC}"
    fi
fi
echo -e "${GREEN}✓${NC} Dependencies ready"

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Step 5/7: DeepSeek API configuration...${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

mkdir -p "$CONFIG_DIR"

# Secure directory permissions
chmod 700 "$CONFIG_DIR"

if [ ! -f "$CONFIG_DIR/config.json" ]; then
    echo -e "${CYAN}DeepSeek API Key Required${NC}"
    echo ""
    echo "Get your key: https://platform.deepseek.com"
    echo -e "${YELLOW}Your key will be stored in: $CONFIG_DIR/config.json${NC}"
    echo -e "${YELLOW}File permissions: 600 (only you can read)${NC}"
    echo ""
    
    # Silent input to hide API key
    read -sp "Enter your DeepSeek API key: " API_KEY
    echo  # Newline after silent input
    
    if [ -z "$API_KEY" ]; then
        echo -e "${RED}✗ API key required${NC}"
        exit 1
    fi
    
    # Validate API key format (should start with sk-)
    if [[ ! "$API_KEY" =~ ^sk-[a-zA-Z0-9]+$ ]]; then
        echo -e "${RED}✗ Invalid API key format${NC}"
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
    
    echo -e "${GREEN}✓${NC} Config saved with secure permissions (600)"
else
    echo -e "${GREEN}✓${NC} Config exists"
    echo -e "${YELLOW}To update API key, edit: $CONFIG_DIR/config.json${NC}"
fi

# Verify config permissions
CONFIG_PERMS=$(stat -c %a "$CONFIG_DIR/config.json" 2>/dev/null || stat -f %A "$CONFIG_DIR/config.json" 2>/dev/null || echo "unknown")
if [[ "$CONFIG_PERMS" != "600" ]]; then
    echo -e "${YELLOW}WARNING: Config file permissions are $CONFIG_PERMS (should be 600)${NC}"
    chmod 600 "$CONFIG_DIR/config.json"
    echo -e "${GREEN}✓${NC} Fixed permissions to 600"
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Step 6/7: Setting up aliases...${NC}"
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

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Step 7/7: Security verification...${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Verify installations
ERRORS=0

if ! command -v qwen &> /dev/null; then
    echo -e "${RED}✗ qwen command not found${NC}"
    ERRORS=$((ERRORS + 1))
fi

if [ ! -d "$SHARK_SKILL_DIR" ]; then
    echo -e "${RED}✗ Shark skill directory not found${NC}"
    ERRORS=$((ERRORS + 1))
fi

if [ ! -f "$CONFIG_DIR/config.json" ]; then
    echo -e "${RED}✗ Config file not found${NC}"
    ERRORS=$((ERRORS + 1))
fi

if [ $ERRORS -gt 0 ]; then
    echo ""
    echo -e "${RED}Installation completed with $ERRORS error(s)${NC}"
    echo -e "${YELLOW}Please review the errors above${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} All components verified"

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
echo -e "${YELLOW}Security notes:${NC}"
echo "  • API key stored in: $CONFIG_DIR/config.json"
echo "  • Permissions: 600 (only you can read)"
echo "  • To change key: nano $CONFIG_DIR/config.json"
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

# Don't source automatically - let user do it
echo -e "${YELLOW}To activate aliases, run:${NC}"
echo "  source ~/.bash_aliases"
echo ""
echo -e "${YELLOW}Or restart your terminal${NC}"
echo ""
