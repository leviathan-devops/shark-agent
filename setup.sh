#!/bin/bash
# Shark Agent Setup - Enhanced Version
# Integrates setup wizard with comprehensive testing

set -e

echo "🦈 SHARK AGENT SETUP"
echo "===================="
echo ""

# Check if setup wizard exists
if [[ ! -f "setup-wizard.sh" ]]; then
    echo "❌ Setup wizard not found"
    exit 1
fi

# Make scripts executable
chmod +x setup-wizard.sh
chmod +x shark-command.sh
chmod +x test-setup.sh

echo "✅ All scripts made executable"

# Run setup wizard
echo ""
echo "🚀 Starting setup wizard..."
./setup-wizard.sh

# Test the installation
echo ""
echo "🧪 Testing installation..."
./test-setup.sh

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Close and reopen your terminal"
echo "2. Type 'shark' to start"
echo "3. Build amazing things!"
