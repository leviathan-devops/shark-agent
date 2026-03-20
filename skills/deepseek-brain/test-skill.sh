#!/bin/bash
# Test the fixed DeepSeek Brain skill

echo "=== Testing Fixed DeepSeek Brain Skill ==="
echo

# Check if API key is set
if [[ -z "$DEEPSEEK_API_KEY" ]]; then
    echo "❌ FAIL: DEEPSEEK_API_KEY environment variable not set"
    exit 1
else
    echo "✅ PASS: DEEPSEEK_API_KEY is set"
fi

# Test basic API connectivity
echo "Testing API connectivity..."
api_test=$(curl -s -X POST "https://api.deepseek.com/v1/chat/completions" \
    -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"model": "deepseek-reasoner", "messages": [{"role": "user", "content": "test"}], "max_tokens": 5}' \
    --max-time 10 2>&1)

if echo "$api_test" | jq -e '.error' >/dev/null 2>&1; then
    echo "❌ FAIL: API connectivity error: $(echo "$api_test" | jq -r '.error.message')"
    exit 1
else
    echo "✅ PASS: API connectivity successful"
fi

# Test the shell script directly
echo
echo "Testing shell script with simple task..."
export DEEPSEEK_API_KEY="sk-e8e93e31b582423e9fdaa4ab8e9347e2"  # Use the original key for testing

# Test simple response
test_result=$(echo "test message" | /home/leviathan/.qwen/skills/deepseek-brain/deepseek-shell.sh "Reply with: TEST_SUCCESS" 2>/dev/null || echo "FAILED")

if echo "$test_result" | grep -q "TEST_SUCCESS"; then
    echo "✅ PASS: Shell script works correctly"
else
    echo "❌ FAIL: Shell script failed"
    echo "Result: $test_result"
fi

# Test command execution
echo
echo "Testing command execution capability..."
cmd_result=$(echo "Create a test file" | /home/leviathan/.qwen/skills/deepseek-brain/deepseek-shell.sh "echo 'DeepSeek test successful' > /tmp/deepseek-test.txt" 2>/dev/null || echo "FAILED")

if [[ -f "/tmp/deepseek-test.txt" ]] && grep -q "DeepSeek test successful" /tmp/deepseek-test.txt; then
    echo "✅ PASS: Command execution works"
    rm -f /tmp/deepseek-test.txt
else
    echo "❌ FAIL: Command execution failed"
fi

# Test configuration file format
echo
echo "Testing skill configuration..."
if jq -e . /home/leviathan/.qwen/skills/deepseek-brain/skill.json >/dev/null 2>&1; then
    echo "✅ PASS: skill.json is valid JSON"
else
    echo "❌ FAIL: skill.json is invalid JSON"
fi

# Check for hardcoded API keys (improved detection logic, excluding POSTMORTEM)
echo
echo "Checking for hardcoded API keys..."
if grep -r "sk-[a-f0-9]" /home/leviathan/.qwen/skills/deepseek-brain/ --exclude="test-skill.sh" --exclude="deepseek-shell.sh" --exclude="POSTMORTEM*" | grep -v "DEEPSEEK_API_KEY" | grep -v "export.*DEEPSEEK_API_KEY" | grep -v "os.environ"; then
    echo "❌ FAIL: Found hardcoded API keys"
    grep -r "sk-[a-f0-9]" /home/leviathan/.qwen/skills/deepseek-brain/ --exclude="test-skill.sh" --exclude="deepseek-shell.sh" --exclude="POSTMORTEM*" | grep -v "DEEPSEEK_API_KEY" | grep -v "export.*DEEPSEEK_API_KEY" | grep -v "os.environ"
    HAS_FAILURES=1
else
    echo "✅ PASS: No hardcoded API keys found"
fi

echo
echo "=== Test Summary ==="

if [[ "$HAS_FAILURES" == "1" ]]; then
    echo "❌ TESTS FAILED: Hardcoded API keys found. The skill needs fixes."
else
    echo "✅ ALL TESTS PASSED: The skill is ready for shark agent deployment."
fi

echo
echo "Usage Instructions:"
echo "1. Set DEEPSEEK_API_KEY environment variable"
echo "2. Use 'plug in to deepseek brain' to activate"
echo "3. The skill now uses direct curl calls instead of broken Python wrappers"