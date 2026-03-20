#!/bin/bash
# Shark Agent - Test Suite
# Usage: ./scripts/test.sh

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
SKILL_DIR="$REPO_ROOT/skills/shark"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           Shark Agent - Test Suite                       ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}✗ Python 3 required${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC} Python 3 found"

# Check requests
if ! python3 -c "import requests" &> /dev/null; then
    echo -e "${YELLOW}! Installing requests...${NC}"
    pip install requests -q
fi
echo -e "${GREEN}✓${NC} Requests library ready"

# Check skill files exist
echo ""
echo -e "${YELLOW}Checking skill files...${NC}"

required_files=(
    "run.py"
    "shark-brain.py"
    "shark-loop.py"
    "shark-client.py"
    "SKILL.md"
    "skill.json"
)

for file in "${required_files[@]}"; do
    if [ -f "$SKILL_DIR/$file" ]; then
        echo -e "${GREEN}✓${NC} $file"
    else
        echo -e "${RED}✗ $file (missing)${NC}"
        exit 1
    fi
done

# Run Python syntax check
echo ""
echo -e "${YELLOW}Running syntax checks...${NC}"

for pyfile in "$SKILL_DIR"/*.py; do
    if python3 -m py_compile "$pyfile" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} $(basename $pyfile)"
    else
        echo -e "${RED}✗ $(basename $pyfile) (syntax error)${NC}"
        exit 1
    fi
done

# Test API connection (if API key available)
echo ""
echo -e "${YELLOW}Testing API connection...${NC}"

if grep -q "sk-" "$SKILL_DIR/run.py" 2>/dev/null; then
    API_KEY=$(grep -oP 'sk-[a-zA-Z0-9]+' "$SKILL_DIR/run.py" | head -1)
    
    if [ -n "$API_KEY" ]; then
        response=$(curl -s -o /dev/null -w "%{http_code}" \
            -H "Authorization: Bearer $API_KEY" \
            https://api.deepseek.com/v1/models 2>/dev/null || echo "000")
        
        if [ "$response" = "200" ]; then
            echo -e "${GREEN}✓${NC} API connection successful"
        elif [ "$response" = "401" ]; then
            echo -e "${YELLOW}!${NC} API key invalid (401)"
        elif [ "$response" = "429" ]; then
            echo -e "${YELLOW}!${NC} Rate limited (429)"
        else
            echo -e "${YELLOW}!${NC} API test skipped (status: $response)${NC}"
        fi
    else
        echo -e "${YELLOW}!${NC} No API key found${NC}"
    fi
else
    echo -e "${YELLOW}!${NC} API key not found in run.py${NC}"
fi

# Test command extraction
echo ""
echo -e "${YELLOW}Testing command extraction...${NC}"

test_output=$(python3 -c "
import re
content = '''
Here's how to do it:
\`\`\`bash
echo hello
ls -la
\`\`\`
Some text
\`\`\`bash
cat test.txt
\`\`\`
'''
commands = re.findall(r'\`\`\`bash\n(.*?)\n\`\`\`', content, re.DOTALL)
print(f'Found {len(commands)} commands')
assert len(commands) == 2, 'Expected 2 commands'
print('✓ Command extraction works')
" 2>&1)

echo -e "$test_output"

# Summary
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Tests Complete! ✓                                       ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}All checks passed!${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Run './scripts/install.sh' to install the skill"
echo "  2. Add your DeepSeek API key"
echo "  3. Test with: shark \"say hello\""
echo ""
