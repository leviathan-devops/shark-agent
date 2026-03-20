#!/bin/bash
# Shark Command Launcher with OpenSandbox Integration
# Launches Qwen Code in YOLO mode with DeepSeek Brain skill and OpenSandbox production workflow

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print welcome message
print_welcome() {
    echo -e "${BLUE}🦈 SHARK AGENT${NC}"
    echo "==============="
    echo ""
    echo "DeepSeek R1 + GLM + OpenSandbox"
    echo "Production-Grade Software Engineer in a Box"
    echo "🧪 All code tested and verified in secure sandbox"
    echo ""
}

# Check if environment is set up
check_environment() {
    if [[ -z "$DEEPSEEK_API_KEY" ]] || [[ -z "$GLM_API_KEY" ]]; then
        echo -e "${RED}❌ API keys not found${NC}"
        echo ""
        echo "Please run the setup wizard:"
        echo "cd $(dirname "$0")"
        echo "./setup-wizard.sh"
        echo ""
        exit 1
    fi

    if ! command -v qwen-code &> /dev/null; then
        echo -e "${RED}❌ Qwen Code not found${NC}"
        echo ""
        echo "Please run the setup wizard:"
        echo "cd $(dirname "$0")"
        echo "./setup-wizard.sh"
        echo ""
        exit 1
    fi
    
    # Check if OpenSandbox is configured
    if [[ ! -f "$HOME/.shark-agent/opensandbox.yaml" ]]; then
        echo -e "${YELLOW}⚠️  OpenSandbox not configured${NC}"
        echo ""
        echo "Installing OpenSandbox..."
        "$(dirname "$0")/scripts/install-opensandbox.sh"
        echo ""
    fi
}

# Check if skill exists
check_skill() {
    local skill_dir="$HOME/.qwen/skills/deepseek-brain"
    if [[ ! -f "$skill_dir/run.py" ]] || [[ ! -f "$skill_dir/skill.json" ]]; then
        echo -e "${RED}❌ DeepSeek Brain skill not found${NC}"
        echo ""
        echo "Please run the setup wizard:"
        echo "cd $(dirname "$0")"
        echo "./setup-wizard.sh"
        echo ""
        exit 1
    fi
}

# Check rate limits and configure API fallback
configure_api_fallback() {
    # GLM API Check (simplified rate limit detection)
    local glm_response=$(curl -s -H "Authorization: Bearer $GLM_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"model": "glm-4v", "messages": [{"role": "user", "content": "test"}], "max_tokens": 1}' \
        "https://open.bigmodel.cn/api/paas/v4/chat/completions" 2>/dev/null)
    
    # Check if GLM API is working
    if echo "$glm_response" | grep -q "error"; then
        echo -e "${YELLOW}⚠️  GLM API issue detected, checking DeepSeek fallback...${NC}"
        
        # Test DeepSeek API
        local deepseek_response=$(curl -s -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
            -H "Content-Type: application/json" \
            -d '{"model": "deepseek-chat", "messages": [{"role": "user", "content": "test"}], "max_tokens": 1}' \
            "https://api.deepseek.com/v1/chat/completions" 2>/dev/null)
            
        if echo "$deepseek_response" | grep -q "error"; then
            echo -e "${RED}❌ Both APIs unavailable${NC}"
            echo "Please check your API keys and network connection"
            exit 1
        else
            echo -e "${GREEN}✅ Using DeepSeek API as primary${NC}"
            export SHARK_PRIMARY_API="deepseek"
        fi
    else
        export SHARK_PRIMARY_API="glm"
        echo -e "${GREEN}✅ Using GLM API as primary${NC}"
    fi
}

# Launch Qwen Code with OpenSandbox integration
launch_qwen_code() {
    print_welcome
    
    local skills_dir="$HOME/.qwen/skills/deepseek-brain"
    local skill_json="$skills_dir/skill.json"
    local opensandbox_config="$HOME/.shark-agent/opensandbox.yaml"

    # Check if skill.json exists and is valid
    if [[ ! -f "$skill_json" ]]; then
        echo -e "${RED}❌ Skill configuration not found${NC}"
        exit 1
    fi

    # Configure API fallback
    configure_api_fallback

    echo -e "${GREEN}🚀 Starting Shark Agent with OpenSandbox...${NC}"
    echo ""
    echo "🧠 DeepSeek R1: Reasoning and planning"
    echo "🛠️  GLM: Mechanical execution (YOLO mode)"
    echo "🧪 OpenSandbox: Secure testing and verification"
    echo ""
    echo "🔧 Production workflow:"
    echo "   Build → Test → Verify → Package → Deliver"
    echo ""
    echo "Type your request and watch Shark Agent build it."
    echo "Example: 'build a Flask API with user authentication'"
    echo ""

    # Enhanced settings with OpenSandbox integration
    local settings_json=$(cat << EOF
{
    "api_keys": {
        "deepseek": {
            "api_key": "$DEEPSEEK_API_KEY",
            "base_url": "https://api.deepseek.com/v1",
            "model": "deepseek-reasoner",
            "timeout": 900
        },
        "glm": {
            "api_key": "$GLM_API_KEY",
            "base_url": "https://open.bigmodel.cn/api/paas/v4",
            "model": "glm-4v-flash",
            "timeout": 900
        },
        "deepseek_coder": {
            "api_key": "$DEEPSEEK_API_KEY",
            "base_url": "https://api.deepseek.com/v1",
            "model": "deepseek-coder",
            "timeout": 900
        }
    },
    "default_provider": "glm",
    "yolo_mode": true,
    "auto_load_skills": true,
    "skills_dir": "$HOME/.qwen/skills",
    "opensandbox": {
        "enabled": true,
        "config": "$opensandbox_config",
        "timeout": 300,
        "max_retries": 3
    },
    "production_workflow": {
        "build_test_verify": true,
        "comprehensive_testing": true,
        "clean_verification": true,
        "auto_packaging": true
    },
    "rate_limit_fallback": {
        "enabled": true,
        "glm_to_deepseek": true,
        "threshold_hours": 2
    }
}
EOF
)

    # Launch Qwen Code with enhanced settings
    exec qwen-code --yolo \
        --settings "$settings_json" \
        --skill "$skill_json" \
        --auto-load \
        --yolo \
        "$@"
}

# Main function
main() {
    check_environment
    check_skill
    launch_qwen_code "$@"
}

# Run main function
main "$@"