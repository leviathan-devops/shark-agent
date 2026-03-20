#!/bin/bash
# Shark Agent Setup Wizard - Grandma Friendly Edition
# Sets up complete dual-brain architecture: DeepSeek R1 + GLM

set -e

echo "🦈 SHARK AGENT SETUP WIZARD"
echo "============================="
echo ""
echo "This will set up your Shark Agent with:"
echo "🧠 DeepSeek R1 for reasoning"
echo "🛠️  GLM for mechanical execution (YOLO mode)"
echo "🎯 Automatic skill loading"
echo ""
echo "Let's get you started! This will take 5-10 minutes."
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_step() {
    echo -e "${BLUE}🔄 $1${NC}"
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

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   print_error "This script should not be run as root"
   exit 1
fi

# Detect operating system
detect_os() {
    print_step "Detecting operating system..."
    
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
        print_success "Linux detected"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
        print_success "macOS detected"
    elif [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
        OS="windows"
        print_success "Windows detected"
    else
        print_error "Unsupported operating system: $OSTYPE"
        exit 1
    fi
}

# Check prerequisites
check_prerequisites() {
    print_step "Checking prerequisites..."
    
    # Check curl
    if ! command -v curl &> /dev/null; then
        print_error "curl is required but not installed"
        exit 1
    fi
    print_success "curl found"
    
    # Check git
    if ! command -v git &> /dev/null; then
        print_error "git is required but not installed"
        exit 1
    fi
    print_success "git found"
    
    # Check Python 3.8+
    if ! command -v python3 &> /dev/null; then
        print_error "Python 3 is required but not installed"
        exit 1
    fi
    
    PYTHON_VERSION=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
    if python3 -c "import sys; exit(0 if sys.version_info >= (3, 8) else 1)"; then
        print_success "Python $PYTHON_VERSION found (>= 3.8 required)"
    else
        print_error "Python 3.8+ required, found $PYTHON_VERSION"
        exit 1
    fi
}

# Get API keys
get_api_keys() {
    echo ""
    print_step "Getting API Keys"
    echo "================="
    echo ""
    
    # DeepSeek API Key
    while true; do
        echo -e "${BLUE}🧠 DeepSeek R1 API Key${NC}"
        echo "Get your API key from: https://platform.deepseek.com/"
        echo ""
        read -p "Enter your DeepSeek API key (starts with 'sk-'): " DEEPSEEK_API_KEY
        
        if [[ $DEEPSEEK_API_KEY =~ ^sk-[a-zA-Z0-9]+$ ]]; then
            print_success "DeepSeek API key format valid"
            break
        else
            print_error "Invalid DeepSeek API key format. Must start with 'sk-'"
        fi
    done
    
    echo ""
    
    # GLM API Key
    while true; do
        echo -e "${BLUE}🛠️  GLM API Key${NC}"
        echo "Get your API key from: https://open.bigmodel.cn/"
        echo ""
        read -p "Enter your GLM API key (starts with 'sk-'): " GLM_API_KEY
        
        if [[ $GLM_API_KEY =~ ^sk-[a-zA-Z0-9]+$ ]]; then
            print_success "GLM API key format valid"
            break
        else
            print_error "Invalid GLM API key format. Must start with 'sk-'"
        fi
    done
    
    echo ""
    
    # GLM Plan Detection
    while true; do
        echo -e "${BLUE}📋 GLM API Plan${NC}"
        echo ""
        echo "1. Coding Plan (Recommended)"
        echo "   - Model: glm-4v-flash"
        echo "   - Better for coding tasks"
        echo "   - More cost-effective"
        echo ""
        echo "2. Pay-Per-Use"
        echo "   - Default model: glm-4v-7b"
        echo "   - Alternative: glm-4v (higher rate limits)"
        echo ""
        read -p "Choose your GLM plan (1 or 2): " GLM_PLAN
        
        if [[ $GLM_PLAN == "1" ]]; then
            GLM_MODEL="glm-4v-flash"
            GLM_BASE_URL="https://open.bigmodel.cn/api/paas/v4"
            print_success "Coding Plan selected: $GLM_MODEL"
            break
        elif [[ $GLM_PLAN == "2" ]]; then
            echo ""
            read -p "Use glm-4v-7b (default) or glm-4v? (7/v): " GLM_CHOICE
            if [[ $GLM_CHOICE == "v" ]]; then
                GLM_MODEL="glm-4v"
                GLM_BASE_URL="https://open.bigmodel.cn/api/paas/v4"
            else
                GLM_MODEL="glm-4v-7b"
                GLM_BASE_URL="https://open.bigmodel.cn/api/paas/v4"
            fi
            print_success "Pay-Per-Use Plan selected: $GLM_MODEL"
            break
        else
            print_error "Invalid choice. Please enter 1 or 2"
        fi
    done
}

# Install Qwen Code
install_qwen_code() {
    echo ""
    print_step "Installing Qwen Code..."
    
    # Determine installation directory
    if [[ "$OS" == "macos" ]]; then
        INSTALL_DIR="$HOME/.local/bin"
    else
        INSTALL_DIR="$HOME/.local/bin"
    fi
    
    mkdir -p "$INSTALL_DIR"
    
    # Download and install Qwen Code
    cd /tmp
    if [[ "$OS" == "macos" ]]; then
        curl -L -o qwen-code-macos-amd64.zip "https://github.com/Qwen/Qwen-Code/releases/latest/download/qwen-code-darwin-amd64.zip"
        unzip -o qwen-code-macos-amd64.zip
        mv qwen-code-darwin-amd64/qwen-code "$INSTALL_DIR/"
    elif [[ "$OS" == "linux" ]]; then
        curl -L -o qwen-code-linux-amd64.zip "https://github.com/Qwen/Qwen-Code/releases/latest/download/qwen-code-linux-amd64.zip"
        unzip -o qwen-code-linux-amd64.zip
        mv qwen-code-linux-amd64/qwen-code "$INSTALL_DIR/"
    else
        print_error "Windows support coming soon"
        exit 1
    fi
    
    chmod +x "$INSTALL_DIR/qwen-code"
    
    # Add to PATH
    if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
        echo 'export PATH="$PATH:'"$INSTALL_DIR"'"' >> ~/.bashrc
        echo 'export PATH="$PATH:'"$INSTALL_DIR"'"' >> ~/.zshrc 2>/dev/null || true
    fi
    
    # Verify installation
    if command -v qwen-code &> /dev/null; then
        print_success "Qwen Code installed successfully"
    else
        print_error "Qwen Code installation failed"
        exit 1
    fi
    
    cd -
}

# Create Shark command
create_shark_command() {
    echo ""
    print_step "Creating 'shark' command..."
    
    SHARK_CMD="$HOME/.local/bin/shark"
    cat > "$SHARK_CMD" << 'EOF'
#!/bin/bash
# Shark Command - Launches Qwen Code in YOLO mode with DeepSeek Brain skill

set -e

# Check if Qwen Code is installed
if ! command -v qwen-code &> /dev/null; then
    echo "Error: Qwen Code not found. Please run setup wizard again."
    exit 1
fi

# Check if API keys are set
if [[ -z "$DEEPSEEK_API_KEY" ]] || [[ -z "$GLM_API_KEY" ]]; then
    echo "Error: API keys not set. Please run setup wizard again."
    exit 1
fi

# Launch Qwen Code with DeepSeek Brain skill
exec qwen-code --yolo \
    --settings '{"api_keys": {"deepseek": {"api_key": "'"${DEEPSEEK_API_KEY}"'", "base_url": "https://api.deepseek.com/v1"}, "glm": {"api_key": "'"${GLM_API_KEY}"'", "base_url": "https://open.bigmodel.cn/api/paas/v4"}}}' \
    --skills "$(dirname "$0")/skills/deepseek-brain/skill.json" \
    --auto-load \
    --yolo \
    "$@"
EOF

    chmod +x "$SHARK_CMD"
    
    # Create alias in shell config
    if [[ -f ~/.bashrc ]]; then
        echo 'alias shark="~/.local/bin/shark"' >> ~/.bashrc
    fi
    if [[ -f ~/.zshrc ]]; then
        echo 'alias shark="~/.local/bin/shark"' >> ~/.zshrc
    fi
    
    print_success "'shark' command created"
}

# Configure Qwen Code settings
configure_qwen_code() {
    echo ""
    print_step "Configuring Qwen Code settings..."
    
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
    
    # Create skills directory
    mkdir -p ~/.qwen/skills
    
    print_success "Qwen Code configured"
}

# Test the installation
test_installation() {
    echo ""
    print_step "Testing installation..."
    
    # Test API connectivity
    echo "Testing DeepSeek API..."
    if curl -s -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
           -H "Content-Type: application/json" \
           -d '{"model": "deepseek-chat", "messages": [{"role": "user", "content": "test"}]}' \
           "https://api.deepseek.com/v1/chat/completions" | grep -q "error"; then
        print_error "DeepSeek API test failed"
        return 1
    fi
    
    echo "Testing GLM API..."
    if curl -s -H "Authorization: Bearer $GLM_API_KEY" \
           -H "Content-Type: application/json" \
           -d '{"model": "'"$GLM_MODEL"'", "messages": [{"role": "user", "content": "test"}]}' \
           "$GLM_BASE_URL/chat/completions" | grep -q "error"; then
        print_error "GLM API test failed"
        return 1
    fi
    
    # Test shark command
    echo "Testing shark command..."
    if ! timeout 5 shark --version &> /dev/null; then
        print_error "Shark command test failed"
        return 1
    fi
    
    print_success "All tests passed!"
}

# Set up environment variables
setup_environment() {
    echo ""
    print_step "Setting up environment variables..."
    
    # Create environment file
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
    
    # Source the environment
    source ~/.shark_env
    
    # Add to shell config
    if [[ -f ~/.bashrc ]] && ! grep -q "~/.shark_env" ~/.bashrc; then
        echo 'source ~/.shark_env' >> ~/.bashrc
    fi
    if [[ -f ~/.zshrc ]] && ! grep -q "~/.shark_env" ~/.zshrc; then
        echo 'source ~/.shark_env' >> ~/.zshrc
    fi
    
    print_success "Environment variables set up"
}

# Main installation process
main() {
    echo ""
    echo "Starting Shark Agent installation..."
    echo ""
    
    detect_os
    check_prerequisites
    get_api_keys
    install_qwen_code
    configure_qwen_code
    create_shark_command
    setup_environment
    test_installation
    
    echo ""
    echo "🎉 SHARK AGENT INSTALLATION COMPLETE!"
    echo "===================================="
    echo ""
    echo "🚀 What's next:"
    echo "1. Close and reopen your terminal"
    echo "2. Type 'shark' to start"
    echo ""
    echo "💡 Example usage:"
    echo "   shark build a flask app"
    echo "   shark create a docker container"
    echo "   shark deploy to heroku"
    echo ""
    echo "📚 Documentation:"
    echo "   skills/deepseek-brain/DUAL_BRAIN_WORKFLOW_DOCUMENTATION.md"
    echo ""
    echo "🧠 Architecture:"
    echo "   • DeepSeek R1: Reasoning and planning"
    echo "   • GLM: Mechanical execution (YOLO mode)"
    echo "   • Build → Test → Verify → Approve → Deliver"
    echo ""
    echo "🦈 Welcome to the future of autonomous coding!"
}

# Run main function
main "$@"