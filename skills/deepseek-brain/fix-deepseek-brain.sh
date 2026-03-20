#!/bin/bash
# DeepSeek Brain Skill Fix Script
# One-click restoration of dual-brain architecture

set -e

echo "🚀 Starting DeepSeek Brain Skill Fix..."
echo "This will restore the complete dual-brain architecture"

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "❌ Git is required but not installed"
    exit 1
fi

# Check if curl is available
if ! command -v curl &> /dev/null; then
    echo "❌ Curl is required but not installed"
    exit 1
fi

# Backup current skill if it exists
BACKUP_DIR="$HOME/.qwen/skills/deepseek-brain-backup-fix-$(date +%Y%m%d-%H%M%S)"
if [ -d "$HOME/.qwen/skills/deepseek-brain" ]; then
    echo "📁 Backing up current skill to: $BACKUP_DIR"
    mkdir -p "$BACKUP_DIR"
    cp -r "$HOME/.qwen/skills/deepseek-brain"/* "$BACKUP_DIR/" 2>/dev/null || true
    echo "✅ Backup completed"
fi

# Clone the backup repository
TEMP_DIR="/tmp/deepseek-brain-fix-$$"
echo "📥 Cloning dual-brain architecture..."
git clone https://github.com/leviathan-devops/dual-brain-shark-backup.git "$TEMP_DIR"
cd "$TEMP_DIR"

# Stop any running processes
pkill -f "deepseek-brain" 2>/dev/null || true
pkill -f "deepseek-loop" 2>/dev/null || true

# Install the skill
SKILL_DIR="$HOME/.qwen/skills/deepseek-brain"
echo "🔧 Installing dual-brain skill to: $SKILL_DIR"

# Remove old skill if exists
if [ -d "$SKILL_DIR" ]; then
    rm -rf "$SKILL_DIR"/*
fi

# Copy new skill files
mkdir -p "$SKILL_DIR"
cp -r * "$SKILL_DIR/"

# Make scripts executable
chmod +x "$SKILL_DIR"/*.py "$SKILL_DIR/deepseek-shell.sh" "$SKILL_DIR/deepseek" "$SKILL_DIR/fix-deepseek-brain.sh"

# Clean up
cd /tmp
rm -rf "$TEMP_DIR"

echo "🎉 DeepSeek Brain skill successfully restored!"
echo ""
echo "📋 Verification:"
echo "✅ Files installed to: $SKILL_DIR"
echo "✅ Scripts made executable"
echo "✅ Backup available at: $BACKUP_DIR"
echo ""
echo "🧪 Test the skill:"
echo "cd $SKILL_DIR"
echo "DEEPSEEK_API_KEY='your-api-key-here' python3 test-skill.sh"
echo ""
echo "🚀 Usage:"
echo "plug in to deepseek brain \"your task\""
echo ""
echo "📚 Documentation:"
echo "cat $SKILL_DIR/DUAL_BRAIN_WORKFLOW_DOCUMENTATION.md"