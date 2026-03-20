#!/bin/bash
# Shark Command Launcher
# Launches Qwen Code in YOLO mode with DeepSeek Brain skill

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
    echo "DeepSeek R1 + GLM Dual-Brain Architecture"
    echo "Production-Grade Software Engineer in a Box"
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

# Launch Qwen Code with DeepSeek Brain
launch_qwen_code() {
    print_welcome
    
    local skills_dir="$HOME/.qwen/skills/deepseek-brain"
    local skill_json="$skills_dir/skill.json"
    
    # Check if skill.json exists and is valid
    if [[ ! -f "$skill_json" ]]; then
        echo -e "${RED}❌ Skill configuration not found${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}🚀 Starting Shark Agent...${NC}"
    echo ""
    echo "🧠 DeepSeek R1: Reasoning and planning"
    echo "🛠️  GLM: Mechanical execution (YOLO mode)"
    echo ""
    echo "Type your request and watch Shark Agent build it."
    echo "Example: 'build a Flask API with user authentication'"
    echo ""
    
    # Launch Qwen Code with DeepSeek Brain skill
    exec qwen-code --yolo \
        --settings "{\"api_keys\": {\"deepseek\": {\"api_key\": \"$DEEPSEEK_API_KEY\", \"base_url\": \"https://api.deepseek.com/v1\"}, \"glm\": {\"api_key\": \"$GLM_API_KEY\", \"base_url\": \"https://open.bigmodel.cn/api/paas/v4\"}}}" \
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