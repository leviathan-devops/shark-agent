#!/bin/bash
# Shark Agent - Uninstaller
# Usage: ./scripts/uninstall.sh

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SKILL_DIR="$HOME/.qwen/skills/shark"
CONFIG_DIR="$HOME/.shark-agent"
ALIASES_FILE="$HOME/.bash_aliases"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           Shark Agent - Uninstaller                      ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Confirm uninstall
read -p "Are you sure you want to uninstall Shark Agent? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Uninstall cancelled.${NC}"
    exit 0
fi

# Remove skill directory
if [ -d "$SKILL_DIR" ]; then
    echo -e "${YELLOW}! Removing skill files...${NC}"
    rm -rf "$SKILL_DIR"
    echo -e "${GREEN}✓${NC} Skill directory removed"
else
    echo -e "${YELLOW}! Skill directory not found${NC}"
fi

# Remove config (optional)
read -p "Keep configuration files? [Y/n] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    if [ -d "$CONFIG_DIR" ]; then
        rm -rf "$CONFIG_DIR"
        echo -e "${GREEN}✓${NC} Config directory removed"
    fi
else
    echo -e "${YELLOW}✓${NC} Config preserved"
fi

# Remove aliases
if [ -f "$ALIASES_FILE" ]; then
    echo -e "${YELLOW}! Removing aliases...${NC}"
    cp "$ALIASES_FILE" "$ALIASES_FILE.backup.$(date +%s)"
    grep -v "shark\|shark-brain" "$ALIASES_FILE" > "$ALIASES_FILE.tmp" || true
    mv "$ALIASES_FILE.tmp" "$ALIASES_FILE"
    echo -e "${GREEN}✓${NC} Aliases removed from ~/.bash_aliases"
fi

# Clean up history file
if [ -f "/tmp/shark-history.json" ]; then
    rm "/tmp/shark-history.json"
    echo -e "${GREEN}✓${NC} Conversation history cleared"
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Uninstall Complete!                                     ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}To reinstall:${NC}"
echo "  curl -fsSL https://raw.githubusercontent.com/leviathan-devops/shark-agent/main/scripts/install.sh | bash"
echo ""
