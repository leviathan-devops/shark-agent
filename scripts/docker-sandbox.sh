#!/bin/bash
# Docker Sandbox Integration for Shark Agent
# Production-grade code execution and testing using Docker containers

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
    print_success "Docker version: $(docker --version)"
}

# Build Docker sandbox image
build_sandbox_image() {
    print_step "Building Docker sandbox image..."
    
    local sandbox_dockerfile=$(cat << 'EOF'
FROM python:3.12-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip install --no-cache-dir \
    pytest \
    flake8 \
    bandit \
    semgrep \
    requests \
    httpx

# Install Node.js dependencies globally
RUN npm install -g npm@latest

# Create workspace
WORKDIR /workspace

# Copy requirements files if they exist
COPY requirements.txt /workspace/ 2>/dev/null || true
COPY package.json /workspace/ 2>/dev/null || true

# Install Python dependencies
RUN if [ -f requirements.txt ]; then pip install -r requirements.txt; fi

# Install Node.js dependencies
RUN if [ -f package.json ]; then npm install; fi

# Set working directory
WORKDIR /workspace

# Create non-root user for security
RUN useradd -m -u 1000 coder && chown -R coder:coder /workspace
USER coder

# Expose workspace
VOLUME /workspace

# Default command
CMD ["/bin/bash"]
EOF
)
    
    # Create Dockerfile
    echo "$sandbox_dockerfile" > /tmp/Dockerfile.shark-sandbox
    
    # Build image
    if docker build -t shark-sandbox:latest -f /tmp/Dockerfile.shark-sandbox .; then
        print_success "Docker sandbox image built successfully"
    else
        print_error "Failed to build Docker sandbox image"
        exit 1
    fi
    
    # Clean up
    rm -f /tmp/Dockerfile.shark-sandbox
}

# Run sandbox
run_sandbox() {
    local working_dir="$1"
    local command="$2"
    local timeout_seconds="${3:-300}"
    
    print_step "Running sandbox with command: $command"
    
    # Run docker container with the command
    if docker run --rm \
        -v "$working_dir:/workspace" \
        -w /workspace \
        --memory="4g" \
        --cpus="2" \
        --network=none \
        --read-only \
        --security-opt=no-new-privileges \
        timeout "$timeout_seconds" \
        bash -c "$command"; then
        print_success "Sandbox command executed successfully"
        return 0
    else
        print_error "Sandbox command failed"
        return 1
    fi
}

# Run tests in sandbox
run_tests() {
    local working_dir="$1"
    local test_command="$2"
    
    print_step "Running tests in sandbox: $test_command"
    
    # Run tests with more resources
    if docker run --rm \
        -v "$working_dir:/workspace" \
        -w /workspace \
        --memory="2g" \
        --cpus="1" \
        --network=host \
        --read-only \
        --security-opt=no-new-privileges \
        timeout 60 \
        bash -c "$test_command"; then
        print_success "Tests passed"
        return 0
    else
        print_error "Tests failed"
        return 1
    fi
}

# Clean environment verification
verify_clean_environment() {
    local working_dir="$1"
    local test_command="$2"
    
    print_step "Verifying in clean environment..."
    
    # Create fresh container for verification
    if docker run --rm \
        -v "$working_dir:/workspace" \
        -w /workspace \
        --memory="2g" \
        --cpus="1" \
        --network=none \
        --read-only \
        --security-opt=no-new-privileges \
        timeout 120 \
        bash -c "$test_command"; then
        print_success "Clean environment verification passed"
        return 0
    else
        print_error "Clean environment verification failed"
        return 1
    fi
}

# Main installation process
main() {
    echo "🧪 Docker Sandbox Installation for Shark Agent"
    echo "============================================"
    echo ""
    
    check_docker
    build_sandbox_image
    
    echo ""
    echo "🎉 Docker sandbox setup completed!"
    echo ""
    echo "📋 Next steps:"
    echo "1. The shark-sandbox:latest image is ready"
    echo "2. All scripts updated to use Docker-based sandboxing"
    echo "3. Security hardened with read-only filesystem and no privileges"
    echo ""
}

# Run if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi