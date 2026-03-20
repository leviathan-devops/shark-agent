#!/bin/bash
# API Key Setup Helper
# Validates and stores API keys securely

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_step() {
    echo -e "${BLUE}🔄 $1${NC}"
}

# Validate DeepSeek API key
validate_deepseek_key() {
    local key=$1
    if [[ $key =~ ^sk-[a-zA-Z0-9]+$ ]]; then
        print_success "DeepSeek API key format valid"
        return 0
    else
        print_error "Invalid DeepSeek API key format"
        return 1
    fi
}

# Test DeepSeek API connectivity
test_deepseek_api() {
    local key=$1
    print_step "Testing DeepSeek API connectivity..."
    
    local response=$(curl -s -H "Authorization: Bearer $key" \
        -H "Content-Type: application/json" \
        -d '{"model": "deepseek-chat", "messages": [{"role": "user", "content": "test"}], "max_tokens": 5}' \
        "https://api.deepseek.com/v1/chat/completions")
    
    if echo "$response" | grep -q "error"; then
        print_error "DeepSeek API test failed"
        return 1
    else
        print_success "DeepSeek API connectivity test passed"
        return 0
    fi
}

# Validate GLM API key
validate_glm_key() {
    local key=$1
    if [[ $key =~ ^sk-[a-zA-Z0-9]+$ ]]; then
        print_success "GLM API key format valid"
        return 0
    else
        print_error "Invalid GLM API key format"
        return 1
    fi
}

# Test GLM API connectivity
test_glm_api() {
    local key=$1
    local model=$2
    
    print_step "Testing GLM API connectivity..."
    
    local response=$(curl -s -H "Authorization: Bearer $key" \
        -H "Content-Type: application/json" \
        -d "{\"model\": \"$model\", \"messages\": [{\"role\": \"user\", \"content\": \"test\"}], \"max_tokens\": 5}" \
        "https://open.bigmodel.cn/api/paas/v4/chat/completions")
    
    if echo "$response" | grep -q "error"; then
        print_error "GLM API test failed"
        return 1
    else
        print_success "GLM API connectivity test passed"
        return 0
    fi
}

# Main API setup function
setup_api_keys() {
    echo ""
    print_step "API Key Setup"
    echo "==============="
    echo ""
    
    # Get DeepSeek API key
    while true; do
        echo -e "${BLUE}🧠 DeepSeek R1 API Key${NC}"
        echo "Get your API key from: https://platform.deepseek.com/"
        echo ""
        read -p "Enter your DeepSeek API key (starts with 'sk-'): " DEEPSEEK_API_KEY
        
        if validate_deepseek_key "$DEEPSEEK_API_KEY" && test_deepseek_api "$DEEPSEEK_API_KEY"; then
            break
        fi
    done
    
    echo ""
    
    # Get GLM API key and plan
    while true; do
        echo -e "${BLUE}🛠️  GLM API Key${NC}"
        echo "Get your API key from: https://open.bigmodel.cn/"
        echo ""
        read -p "Enter your GLM API key (starts with 'sk-'): " GLM_API_KEY
        
        if validate_glm_key "$GLM_API_KEY"; then
            break
        fi
    done
    
    echo ""
    
    # Choose GLM plan
    while true; do
        echo -e "${BLUE}📋 GLM API Plan${NC}"
        echo ""
        echo "1. Coding Plan (Recommended)"
        echo "   - Model: glm-4v-flash"
        echo "   - Better for coding tasks"
        echo ""
        echo "2. Pay-Per-Use"
        echo "   - Default model: glm-4v-7b"
        echo "   - Alternative: glm-4v"
        echo ""
        read -p "Choose your GLM plan (1 or 2): " GLM_PLAN
        
        if [[ $GLM_PLAN == "1" ]]; then
            GLM_MODEL="glm-4v-flash"
            GLM_BASE_URL="https://open.bigmodel.cn/api/paas/v4"
            
            if test_glm_api "$GLM_API_KEY" "$GLM_MODEL"; then
                break
            fi
        elif [[ $GLM_PLAN == "2" ]]; then
            echo ""
            read -p "Use glm-4v-7b (default) or glm-4v? (7/v): " GLM_CHOICE
            if [[ $GLM_CHOICE == "v" ]]; then
                GLM_MODEL="glm-4v"
            else
                GLM_MODEL="glm-4v-7b"
            fi
            
            if test_glm_api "$GLM_API_KEY" "$GLM_MODEL"; then
                break
            fi
        else
            print_error "Invalid choice. Please enter 1 or 2"
        fi
    done
    
    # Create environment file
    echo ""
    print_step "Creating environment configuration..."
    
    mkdir -p ~/.qwen
    
    cat > ~/.qwen/settings.json << EOF
{
  "api_keys": {
    "deepseek": {
      "api_key": "$DEEPSEEK_API_KEY",
      "base_url": "https://api.deepseek.com/v1"
    },
    "glm": {
      "api_key": "$GLM_API_KEY",
      "base_url": "$GLM_BASE_URL"
    }
  },
  "default_provider": "glm",
  "yolo_mode": true,
  "auto_load_skills": true,
  "skills_dir": "$HOME/.qwen/skills"
}
EOF
    
    # Create environment variables file
    cat > ~/.shark_env << EOF
# Shark Agent Environment Variables
export DEEPSEEK_API_KEY="$DEEPSEEK_API_KEY"
export GLM_API_KEY="$GLM_API_KEY"
export QWEN_SKILLS_DIR="$HOME/.qwen/skills"
export PATH="\$PATH:$HOME/.local/bin"

# Load Shark alias
if [[ -f ~/.bashrc ]]; then
    alias shark="~/.local/bin/shark"
fi
if [[ -f ~/.zshrc ]]; then
    alias shark="~/.local/bin/shark"
fi
EOF
    
    # Add to shell config
    if [[ -f ~/.bashrc ]] && ! grep -q "~/.shark_env" ~/.bashrc; then
        echo 'source ~/.shark_env' >> ~/.bashrc
    fi
    if [[ -f ~/.zshrc ]] && ! grep -q "~/.shark_env" ~/.zshrc; then
        echo 'source ~/.shark_env' >> ~/.zshrc
    fi
    
    print_success "API keys configured successfully"
    
    # Source environment
    source ~/.shark_env
}

# If script is run directly, setup API keys
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    setup_api_keys
fi