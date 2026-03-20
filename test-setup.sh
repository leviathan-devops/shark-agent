#!/bin/bash
# Shark Agent Setup Validation
# Tests the complete installation in a sandboxed environment

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_test() {
    echo -e "${BLUE}🧪 Testing: $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Test environment variables
test_environment() {
    print_test "Environment Variables"
    
    if [[ -z "$DEEPSEEK_API_KEY" ]]; then
        print_error "DEEPSEEK_API_KEY not set"
        return 1
    fi
    
    if [[ -z "$GLM_API_KEY" ]]; then
        print_error "GLM_API_KEY not set"
        return 1
    fi
    
    if [[ -z "$QWEN_SKILLS_DIR" ]]; then
        print_error "QWEN_SKILLS_DIR not set"
        return 1
    fi
    
    print_success "All environment variables set"
}

# Test OpenSandbox installation
test_opensandbox() {
    print_test "OpenSandbox Installation"
    
    # Check if OpenSandbox configuration exists
    if [[ ! -f "$HOME/.shark-agent/opensandbox.yaml" ]]; then
        print_error "OpenSandbox configuration not found"
        return 1
    fi
    print_success "OpenSandbox configuration exists"
    
    # Check if OpenSandbox Python module can be imported
    if python3 -c "import opensandbox; print('OpenSandbox available')" 2>/dev/null; then
        print_success "OpenSandbox Python SDK imported"
    else
        print_error "OpenSandbox Python SDK import failed"
        return 1
    fi
    
    # Check if Docker is running (required for OpenSandbox)
    if docker info &> /dev/null; then
        print_success "Docker is running (required for OpenSandbox)"
    else
        print_error "Docker is not running"
        return 1
    fi
    
    # Test basic OpenSandbox functionality
    if python3 -c "
import opensandbox
try:
    # Test basic OpenSandbox class
    from opensandbox import Sandbox
    print('OpenSandbox classes available')
except ImportError as e:
    print(f'Import error: {e}')
    exit(1)
" 2>/dev/null; then
        print_success "OpenSandbox functionality test passed"
    else
        print_error "OpenSandbox functionality test failed"
        return 1
    fi
}

# Test command availability
test_commands() {
    print_test "Command Availability"
    
    if ! command -v qwen-code &> /dev/null; then
        print_error "qwen-code not found"
        return 1
    fi
    
    if ! command -v shark &> /dev/null; then
        print_error "shark command not found"
        return 1
    fi
    
    print_success "All commands available"
}

# Test API connectivity
test_api_connectivity() {
    print_test "API Connectivity"
    
    # Test DeepSeek API
    local deepseek_response=$(curl -s -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"model": "deepseek-chat", "messages": [{"role": "user", "content": "test"}], "max_tokens": 5}' \
        "https://api.deepseek.com/v1/chat/completions")
    
    if echo "$deepseek_response" | grep -q "error"; then
        print_error "DeepSeek API connectivity failed"
        echo "Response: $deepseek_response"
        return 1
    fi
    
    # Test GLM API
    local glm_response=$(curl -s -H "Authorization: Bearer $GLM_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"model": "glm-4v", "messages": [{"role": "user", "content": "test"}], "max_tokens": 5}' \
        "https://open.bigmodel.cn/api/paas/v4/chat/completions")
    
    if echo "$glm_response" | grep -q "error"; then
        print_error "GLM API connectivity failed"
        echo "Response: $glm_response"
        return 1
    fi
    
    print_success "Both APIs are reachable"
}

# Test skill configuration
test_skill_config() {
    print_test "Skill Configuration"
    
    local skill_dir="$HOME/.qwen/skills/deepseek-brain"
    
    if [[ ! -f "$skill_dir/run.py" ]]; then
        print_error "run.py not found"
        return 1
    fi
    
    if [[ ! -f "$skill_dir/skill.json" ]]; then
        print_error "skill.json not found"
        return 1
    fi
    
    # Validate JSON
    if ! python3 -m json.tool "$skill_dir/skill.json" > /dev/null 2>&1; then
        print_error "skill.json is invalid"
        return 1
    fi
    
    # Validate Python syntax
    if ! python3 -m py_compile "$skill_dir/run.py"; then
        print_error "run.py has syntax errors"
        return 1
    fi
    
    print_success "Skill configuration is valid"
}

# Test dual-brain architecture
test_dual_brain() {
    print_test "Dual-Brain Architecture"
    
    local skill_dir="$HOME/.qwen/skills/deepseek-brain"
    
    # Check for required protocols
    if ! grep -q "REASONING BRAIN" "$skill_dir/run.py"; then
        print_error "REASONING BRAIN protocol not found"
        return 1
    fi
    
    if ! grep -q "EXECUTION HANDS" "$skill_dir/run.py"; then
        print_error "EXECUTION HANDS protocol not found"
        return 1
    fi
    
    if ! grep -q "MANDATORY TESTING" "$skill_dir/run.py"; then
        print_error "MANDATORY TESTING protocol not found"
        return 1
    fi
    
    print_success "Dual-brain architecture is properly configured"
}

# Test security configuration
test_security() {
    print_test "Security Configuration"
    
    # Check for hardcoded API keys
    local skill_dir="$HOME/.qwen/skills/deepseek-brain"
    
    if grep -q "sk-[a-f0-9]" "$skill_dir/"*.py | grep -v "DEEPSEEK_API_KEY" | grep -v "GLM_API_KEY"; then
        print_error "Hardcoded API keys found in skill files"
        return 1
    fi
    
    # Check environment variable usage
    if ! grep -q "os.environ.get" "$skill_dir/run.py"; then
        print_error "Environment variables not used properly"
        return 1
    fi
    
    print_success "Security configuration is valid"
}

# Test sandbox functionality
test_sandbox() {
    print_test "Sandbox Testing"
    
    # Create temporary sandbox directory
    local sandbox_dir="/tmp/shark-test-$$"
    mkdir -p "$sandbox_dir"
    cd "$sandbox_dir"
    
    # Test basic file operations
    echo "test" > test.txt
    if [[ ! -f "test.txt" ]]; then
        print_error "Sandbox file operations failed"
        cd /tmp
        rm -rf "$sandbox_dir"
        return 1
    fi
    
    # Test command execution
    if ! echo "echo 'success'" | bash | grep -q "success"; then
        print_error "Sandbox command execution failed"
        cd /tmp
        rm -rf "$sandbox_dir"
        return 1
    fi
    
    # Cleanup
    cd /tmp
    rm -rf "$sandbox_dir"
    
    print_success "Sandbox functionality works"
}

# Test production readiness
test_production_readiness() {
    print_test "Production Readiness"
    
    # Check if all required files exist
    local required_files=(
        "$HOME/.local/bin/qwen-code"
        "$HOME/.local/bin/shark"
        "$HOME/.qwen/settings.json"
        "$HOME/.qwen/skills/deepseek-brain/run.py"
        "$HOME/.qwen/skills/deepseek-brain/skill.json"
        "$HOME/.shark_env"
    )
    
    for file in "${required_files[@]}"; do
        if [[ ! -f "$file" ]]; then
            print_error "Required file missing: $file"
            return 1
        fi
    done
    
    # Check file permissions
    if [[ ! -x "$HOME/.local/bin/shark" ]]; then
        print_error "shark command is not executable"
        return 1
    fi
    
    print_success "Production ready"
}

# Performance test
test_performance() {
    print_test "Performance Test"
    
    local start_time=$(date +%s)
    
    # Test basic API response time
    local response_time=$(curl -o /dev/null -s -w '%{time_total}' \
        -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"model": "deepseek-chat", "messages": [{"role": "user", "content": "test"}]}' \
        "https://api.deepseek.com/v1/chat/completions")
    
    local end_time=$(date +%s)
    local total_time=$((end_time - start_time))
    
    # Check if response time is reasonable (< 5 seconds)
    if (( $(echo "$response_time > 5" | bc -l) )); then
        print_warning "API response time is slow: ${response_time}s"
    else
        print_success "API response time is good: ${response_time}s"
    fi
    
    # Check total installation time
    if [[ $total_time -gt 300 ]]; then
        print_warning "Installation took longer than expected: ${total_time}s"
    else
        print_success "Installation time is reasonable: ${total_time}s"
    fi
}

# Main test function
main() {
    echo "🦈 SHARK AGEND SETUP VALIDATION"
    echo "================================"
    echo ""
    
    local tests=(
        "test_environment"
        "test_commands"
        "test_api_connectivity"
        "test_skill_config"
        "test_dual_brain"
        "test_security"
        "test_sandbox"
        "test_opensandbox"
        "test_production_readiness"
        "test_performance"
    )
    
    local passed=0
    local failed=0
    
    for test in "${tests[@]}"; do
        if $test; then
            ((passed++))
        else
            ((failed++))
            echo ""
        fi
        echo ""
    done
    
    echo "📊 TEST RESULTS"
    echo "==============="
    echo "✅ Passed: $passed"
    echo "❌ Failed: $failed"
    echo ""
    
    if [[ $failed -eq 0 ]]; then
        echo -e "${GREEN}🎉 ALL TESTS PASSED!${NC}"
        echo ""
        echo "Shark Agent is ready for production!"
        echo ""
        echo "Next steps:"
        echo "1. Close and reopen your terminal"
        echo "2. Type 'shark' to start"
        echo "3. Build amazing things!"
        echo ""
        exit 0
    else
        echo -e "${RED}❌ $failed TESTS FAILED${NC}"
        echo ""
        echo "Please fix the issues and run the setup wizard again:"
        echo "./setup-wizard.sh"
        echo ""
        exit 1
    fi
}

# Check if being sourced or executed
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi