#!/bin/bash
# Shark Agent - One-Line Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/leviathan-devops/shark-agent/main/scripts/install.sh | bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
REPO_URL="https://github.com/leviathan-devops/shark-agent.git"
SKILL_DIR="$HOME/.qwen/skills/shark"
BACKUP_DIR="$HOME/.qwen/skills/shark.backup.$(date +%s)"
CONFIG_DIR="$HOME/.shark-agent"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           Shark Agent - Installer                        ║${NC}"
echo -e "${BLUE}║     Transform your coding agent into Dual-Brain          ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check for Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}✗ Python 3 is required but not installed.${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC} Python 3 found"

# Check for requests library
if ! python3 -c "import requests" &> /dev/null; then
    echo -e "${YELLOW}! Installing 'requests' library...${NC}"
    pip install requests --break-system-packages -q 2>/dev/null || pip install requests -q 2>/dev/null || true
fi
echo -e "${GREEN}✓${NC} Requests library ready"

# Backup existing installation
if [ -d "$SKILL_DIR" ]; then
    echo -e "${YELLOW}! Backing up existing installation...${NC}"
    mv "$SKILL_DIR" "$BACKUP_DIR"
    echo -e "${GREEN}✓${NC} Backup saved to: $BACKUP_DIR"
fi

# Clone or copy skill files
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

if [ -d "$REPO_ROOT/skills/shark" ]; then
    echo -e "${GREEN}✓${NC} Installing from local repository..."
    mkdir -p "$(dirname "$SKILL_DIR")"
    cp -r "$REPO_ROOT/skills/shark" "$SKILL_DIR"
elif command -v git &> /dev/null && [ ! -z "$REPO_URL" ]; then
    echo -e "${YELLOW}! Cloning repository...${NC}"
    mkdir -p "$(dirname "$SKILL_DIR")"
    git clone "$REPO_URL" /tmp/shark-temp 2>/dev/null || {
        echo -e "${YELLOW}! Installing from local files instead...${NC}"
        cp -r "$SCRIPT_DIR/../skills/shark" "$SKILL_DIR"
    }
    if [ -d "/tmp/shark-temp/skills/shark" ]; then
        cp -r /tmp/shark-temp/skills/shark "$SKILL_DIR"
        rm -rf /tmp/shark-temp
    fi
else
    echo -e "${YELLOW}! Installing from local files...${NC}"
    mkdir -p "$(dirname "$SKILL_DIR")"
    cp -r "$SCRIPT_DIR/../skills/shark" "$SKILL_DIR"
fi
echo -e "${GREEN}✓${NC} Skill files installed to: $SKILL_DIR"

# Create config directory
mkdir -p "$CONFIG_DIR"
if [ ! -f "$CONFIG_DIR/config.json" ]; then
    cat > "$CONFIG_DIR/config.json" << 'EOF'
{
  "api_key": "YOUR_API_KEY_HERE",
  "model": "deepseek-reasoner",
  "timeout": 120,
  "max_loops": 10,
  "yolo_mode": true,
  "verbose": false
}
EOF
    echo -e "${YELLOW}!${NC} Config created: $CONFIG_DIR/config.json"
    echo -e "${YELLOW}  Edit this file to add your DeepSeek API key${NC}"
fi

# Add aliases to bash_aliases
ALIASES_FILE="$HOME/.bash_aliases"
if ! grep -q "shark" "$ALIASES_FILE" 2>/dev/null; then
    cat >> "$ALIASES_FILE" << 'EOF'

# Shark Agent - Dual Brain Architecture
alias shark='python3 ~/.qwen/skills/shark/run.py'
alias shark-brain='python3 ~/.qwen/skills/shark/shark-brain.py'
EOF
    echo -e "${GREEN}✓${NC} Aliases added to ~/.bash_aliases"
else
    echo -e "${GREEN}✓${NC} Aliases already exist"
fi

# Make scripts executable
chmod +x "$SKILL_DIR"/*.py 2>/dev/null || true
chmod +x "$SKILL_DIR"/shark 2>/dev/null || true
echo -e "${GREEN}✓${NC} Scripts made executable"

# Source bash_aliases if in interactive shell
if [ -f "$ALIASES_FILE" ] && [ -n "$PS1" ]; then
    source "$ALIASES_FILE" 2>/dev/null || true
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Installation Complete! 🦈                               ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo ""
echo -e "  1. ${YELLOW}Add your DeepSeek API key:${NC}"
echo -e "     Get key: https://platform.deepseek.com"
echo -e "     Edit: $CONFIG_DIR/config.json"
echo ""
echo -e "  2. ${YELLOW}Test the installation:${NC}"
echo -e "     shark \"say hello and run: echo test\""
echo ""
echo -e "  3. ${YELLOW}In your coding agent, say:${NC}"
echo -e "     \"plug in to deepseek brain\""
echo ""
echo -e "${BLUE}Available commands:${NC}"
echo "  shark \"task\"          - Run a task"
echo "  shark-brain           - Interactive mode"
echo ""
echo -e "${BLUE}Compatible Agents:${NC}"
echo "  ✓ Qwen Code    ✓ Claude Code    ✓ Hermes    ✓ OpenFang"
echo ""
echo -e "${YELLOW}Need help?${NC} See: https://github.com/leviathan-devops/shark-agent"
echo ""
