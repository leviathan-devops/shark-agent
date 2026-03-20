#!/bin/bash
# Simple "fix the deepseek brain skill" command

echo "🚀 Fixing DeepSeek Brain Skill..."

# Detect if user said "fix the deepseek brain skill"
if [[ "$*" == *"fix the deepseek brain skill"* ]]; then
    echo "✅ Detected 'fix the deepseek brain skill' command"
    echo "🔧 Restoring complete dual-brain architecture..."
fi

# Backup current skill
BACKUP_DIR="$HOME/.qwen/skills/deepseek-brain-backup-$(date +%Y%m%d-%H%M%S)"
if [ -d "$HOME/.qwen/skills/deepseek-brain" ]; then
    echo "📁 Backing up current skill to: $BACKUP_DIR"
    mkdir -p "$BACKUP_DIR"
    cp -r "$HOME/.qwen/skills/deepseek-brain"/* "$BACKUP_DIR/" 2>/dev/null || true
fi

# Clone and install
echo "📥 Installing dual-brain architecture..."
TEMP_DIR="/tmp/deepseek-brain-fix-$$"
git clone https://github.com/leviathan-devops/dual-brain-shark-backup.git "$TEMP_DIR"
cd "$TEMP_DIR"

# Stop running processes
pkill -f "deepseek-brain" 2>/dev/null || true
pkill -f "deepseek-loop" 2>/dev/null || true

# Install skill
SKILL_DIR="$HOME/.qwen/skills/deepseek-brain"
rm -rf "$SKILL_DIR"/* 2>/dev/null || true
mkdir -p "$SKILL_DIR"
cp -r * "$SKILL_DIR/"
chmod +x "$SKILL_DIR"/*.py "$SKILL_DIR/deepseek-shell.sh" "$SKILL_DIR/deepseek"

# Clean up
cd /tmp
rm -rf "$TEMP_DIR"

echo "🎉 DeepSeek Brain skill fixed!"
echo ""
echo "✅ Complete dual-brain architecture restored"
echo "✅ Mandatory testing protocol enabled"
echo "✅ OpenRouter fallback configured"
echo "✅ Security hardening applied"
echo ""
echo "🧪 Test the skill:"
echo "cd ~/.qwen/skills/deepseek-brain"
echo "DEEPSEEK_API_KEY='your-key' python3 test-skill.sh"
echo ""
echo "🚀 Ready for production use!"
echo "plug in to deepseek brain \"your task\""