#!/bin/bash
# OpenSandbox Installation Script for Shark Agent

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Check Docker
check_docker() {
    print_step "Checking Docker installation..."
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        print_error "Docker is not running. Please start Docker."
        exit 1
    fi
    
    print_success "Docker is running"
}

# Install OpenSandbox
install_opensandbox() {
    print_step "Installing OpenSandbox server..."
    
    # Install OpenSandbox
    if python3 -m pip install "opensandbox-server>=0.1.7" --break-system-packages; then
        print_success "OpenSandbox server installed successfully"
    else
        print_error "Failed to install OpenSandbox server"
        exit 1
    fi
    
    # Install uv for package management
    print_step "Installing uv for package management..."
    if curl -LsSf https://astral.sh/uv/install.sh | sh; then
        print_success "uv installed successfully"
        # Add uv to PATH
        export PATH="$HOME/.cargo/bin:$PATH"
        echo 'export PATH="$HOME/.cargo/bin:$PATH"' >> ~/.bashrc
        echo 'export PATH="$HOME/.cargo/bin:$PATH"' >> ~/.zshrc 2>/dev/null || true
    else
        print_warning "uv installation failed, continuing with pip"
    fi
}

# Configure OpenSandbox
configure_opensandbox() {
    print_step "Configuring OpenSandbox..."
    
    # Create configuration directory
    mkdir -p "$HOME/.shark-agent"
    
    # Copy configuration
    if [[ -f "$(dirname "$0")/../opensandbox.yaml" ]]; then
        cp "$(dirname "$0")/../opensandbox.yaml" "$HOME/.shark-agent/opensandbox.yaml"
    else
        print_warning "OpenSandbox configuration not found, using default"
        # Create basic configuration
        cat > "$HOME/.shark-agent/opensandbox.yaml" << 'EOF'
sandbox:
  image: "opensandbox/code-interpreter:v1.0.2"
  timeout: 300
  cpu_limit: "2"
  memory_limit: "4g"
  network:
    allow_outbound: true
    allow_inbound: false
  runtime: "gvisor"

workflow:
  max_retries: 3
  test_timeout: 60
  clean_verification: true
EOF
    fi
    
    print_success "OpenSandbox configured"
}

# Test Installation
test_installation() {
    print_step "Testing OpenSandbox installation..."
    
    # Test Python import
    if python3 -c "import opensandbox; print('✅ OpenSandbox SDK imported successfully')" 2>/dev/null; then
        print_success "OpenSandbox SDK working"
    else
        print_error "OpenSandbox SDK import failed"
        exit 1
    fi
    
    # Test Docker connection
    if docker run --rm hello-world &> /dev/null; then
        print_success "Docker connection working"
    else
        print_error "Docker connection failed"
        exit 1
    fi
    
    print_success "OpenSandbox installation test completed"
}

# Main installation process
main() {
    echo "🧪 OpenSandbox Installation for Shark Agent"
    echo "=========================================="
    echo ""
    
    check_docker
    install_opensandbox
    configure_opensandbox
    test_installation
    
    echo ""
    echo "🎉 OpenSandbox installation completed!"
    echo ""
    echo "📋 Next steps:"
    echo "1. Restart your terminal"
    echo "2. Run 'shark' to start using OpenSandbox-enabled coding"
    echo ""
}

# Run installation
main "$@"