#!/bin/bash
# Shark Skill - Standalone Installer (HARDENED)
# For users who already have Qwen Code and just want the Shark Skill
# Usage: curl -fsSL https://raw.githubusercontent.com/leviathan-devops/shark-agent/main/scripts/install.sh | bash
#
# SECURITY: Download and verify checksum for maximum security

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SHARK_SKILL_DIR="$HOME/.qwen/skills/shark"
CONFIG_DIR="$HOME/.shark-agent"
REPO_URL="https://github.com/leviathan-devops/shark-agent.git"
BRANCH="main"

echo "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo "${BLUE}║           Shark Skill - Installer                        ║${NC}"
echo "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Security notice
echo "${YELLOW}SECURITY NOTICE:${NC}"
echo "This script will clone a GitHub repository and install Python scripts."
echo ""
read -p "Continue? [Y/n] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "${YELLOW}Installation cancelled.${NC}"
    exit 0
fi

# Check for Python
if ! command -v python3 &> /dev/null; then
    echo "${RED}✗ Python 3 required${NC}"
    exit 1
fi
echo "${GREEN}✓${NC} Python 3 found"

# Check for requests
if ! python3 -c "import requests" &> /dev/null; then
    echo "${YELLOW}Installing requests...${NC}"
    pip install requests --break-system-packages -q 2>/dev/null || \
    pip install requests -q 2>/dev/null || \
    pip3 install requests -q 2>/dev/null || {
        echo "${RED}Install manually: pip install requests${NC}"
        exit 1
    }
fi
echo "${GREEN}✓${NC} Requests library ready"

# Backup existing
if [ -d "$SHARK_SKILL_DIR" ]; then
    BACKUP_NAME="$SHARK_SKILL_DIR.backup.$(date +%s)"
    echo "${YELLOW}Backing up existing skill to: $BACKUP_NAME${NC}"
    mv "$SHARK_SKILL_DIR" "$BACKUP_NAME"
fi

# Use secure temp directory
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT ERR INT TERM

# Clone repo
echo "${YELLOW}Cloning Shark Agent...${NC}"
if ! git clone --depth 1 -b "$BRANCH" "$REPO_URL" "$TEMP_DIR/shark" 2>/dev/null; then
    echo "${RED}✗ Failed to clone repository${NC}"
    exit 1
fi

# Verify expected files
if [ ! -f "$TEMP_DIR/shark/skills/shark/run.py" ]; then
    echo "${RED}✗ Expected skill files not found${NC}"
    exit 1
fi

# Install skill
mkdir -p "$(dirname "$SHARK_SKILL_DIR")"
cp -r "$TEMP_DIR/shark/skills/shark" "$SHARK_SKILL_DIR"

# Set permissions
chmod 755 "$SHARK_SKILL_DIR"/*.py 2>/dev/null || true
chmod 755 "$SHARK_SKILL_DIR"/shark 2>/dev/null || true

echo "${GREEN}✓${NC} Shark skill installed"

# Config
mkdir -p "$CONFIG_DIR"
chmod 700 "$CONFIG_DIR"

if [ ! -f "$CONFIG_DIR/config.json" ]; then
    cat > "$CONFIG_DIR/config.json" << 'EOF'
{
  "api_key": "YOUR_API_KEY_HERE",
  "model": "deepseek-reasoner",
  "timeout": 300,
  "max_loops": 10,
  "yolo_mode": true
}
EOF
    chmod 600 "$CONFIG_DIR/config.json"
    echo "${YELLOW}!${NC} Edit ~/.shark-agent/config.json with your API key"
    echo "${YELLOW}  File permissions set to 600 (only you can read)${NC}"
else
    echo "${GREEN}✓${NC} Config exists"
fi

# Aliases
if [ ! -f "$HOME/.bash_aliases" ]; then
    touch "$HOME/.bash_aliases"
fi

if ! grep -q "alias shark=" "$HOME/.bash_aliases" 2>/dev/null; then
    cat >> "$HOME/.bash_aliases" << 'EOF'

# Shark Skill
alias shark='python3 ~/.qwen/skills/shark/run.py'
alias shark-brain='python3 ~/.qwen/skills/shark/shark-brain.py'
EOF
    if [ -n "$PS1" ]; then
        source "$HOME/.bash_aliases" 2>/dev/null || true
    fi
fi

echo ""
echo "${GREEN}✓ Installation complete!${NC}"
echo ""
echo "Usage in Qwen Code:"
echo '  "plug in to deepseek brain"'
echo ""
echo "${YELLOW}Security:${NC}"
echo "  Config: $CONFIG_DIR/config.json (permissions 600)"
echo "  Skill: $SHARK_SKILL_DIR"
echo ""
