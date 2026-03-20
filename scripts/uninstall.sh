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

echo "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo "${BLUE}║           Shark Agent - Uninstaller                      ║${NC}"
echo "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Confirm uninstall
read -p "Are you sure you want to uninstall Shark Agent? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "${YELLOW}Uninstall cancelled.${NC}"
    exit 0
fi

# Remove skill directory
if [ -d "$SKILL_DIR" ]; then
    echo "${YELLOW}! Removing skill files...${NC}"
    rm -rf "$SKILL_DIR"
    echo "${GREEN}✓${NC} Skill directory removed"
else
    echo "${YELLOW}! Skill directory not found${NC}"
fi

# Remove config (optional)
read -p "Keep configuration files? [Y/n] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    if [ -d "$CONFIG_DIR" ]; then
        rm -rf "$CONFIG_DIR"
        echo "${GREEN}✓${NC} Config directory removed"
    fi
else
    echo "${YELLOW}✓${NC} Config preserved"
fi

# Remove aliases
if [ -f "$ALIASES_FILE" ]; then
    echo "${YELLOW}! Removing aliases...${NC}"
    cp "$ALIASES_FILE" "$ALIASES_FILE.backup.$(date +%s)"
    grep -v "shark\|shark-brain" "$ALIASES_FILE" > "$ALIASES_FILE.tmp" || true
    mv "$ALIASES_FILE.tmp" "$ALIASES_FILE"
    echo "${GREEN}✓${NC} Aliases removed from ~/.bash_aliases"
fi

# Clean up history file
if [ -f "/tmp/shark-history.json" ]; then
    rm "/tmp/shark-history.json"
    echo "${GREEN}✓${NC} Conversation history cleared"
fi

echo ""
echo "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo "${GREEN}║  Uninstall Complete!                                     ║${NC}"
echo "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "${YELLOW}To reinstall:${NC}"
echo "  curl -fsSL https://raw.githubusercontent.com/leviathan-devops/shark-agent/main/scripts/install.sh | bash"
echo ""
