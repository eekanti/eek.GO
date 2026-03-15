#!/bin/bash
# Deployment Script for Plexie Server
# Run this script to deploy the multi-agent system on your Ubuntu server

set -e  # Exit on error

echo "========================================="
echo "Multi-Agent System Deployment Script"
echo "Server: Plexie (Ubuntu)"
echo "========================================="

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root or with sudo"
    exit
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print status messages
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Step 1: Check prerequisites
echo ""
echo "Step 1: Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Installing Docker now..."
    apt-get update && apt-get install -y docker.io
fi

if ! command -v docker-compose &> /dev/null; then
    print_warning "docker-compose not found, trying to use docker compose plugin..."
    if ! docker compose version &> /dev/null; then
        print_error "Neither docker-compose nor docker compose plugin found. Please install Docker Compose first."
        exit 1
    fi
fi

if ! command -v git &> /dev/null; then
    print_warning "Git not installed, installing now..."
    apt-get update && apt-get install -y git
fi

print_status "All prerequisites met"

# Step 2: Clone or update repository
echo ""
echo "Step 2: Setting up project directory..."

PROJECT_DIR="/root/ai-coding-agents"
if [ ! -d "$PROJECT_DIR" ]; then
    print_warning "Project directory does not exist, cloning repository..."
    git clone https://github.com/eekanti/n8n-team.git $PROJECT_DIR
else
    print_status "Updating existing project directory..."
    cd $PROJECT_DIR && git pull origin main
fi

# Step 3: Configure environment variables
echo ""
echo "Step 3: Configuring environment variables..."

if [ ! -f "$PROJECT_DIR/.env" ]; then
    cp $PROJECT_DIR/.env.example $PROJECT_DIR/.env
    print_warning "Created .env file from example. Please edit it with your actual values!"
    echo "Required changes:"
    echo "  - DOMAIN_NAME: Your server's domain or IP address"
    echo "  - LOCAL_AI_MODEL: The exact model name loaded in LM Studio"
    echo ""
    read -p "Press Enter after you've edited .env file..."
else
    print_status ".env file already exists"
fi

# Step 4: Create data directories for persistence
echo ""
echo "Step 4: Creating persistent storage directories..."

mkdir -p /docker/appdata/n8n/data
mkdir -p /docker/appdata/n8n/local-files
mkdir -p /docker/appdata/redis/data
print_status "Data directories created"

# Step 5: Start services with Docker Compose
echo ""
echo "Step 5: Starting n8n and Redis containers..."

cd $PROJECT_DIR

if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker-compose"
else
    DOCKER_COMPOSE_CMD="docker compose"
fi

$DOCKER_COMPOSE_CMD up -d

print_status "Services started!"

# Step 6: Wait for n8n to be ready
echo ""
echo "Step 6: Waiting for n8n to initialize..."

MAX_RETRIES=30
RETRY_COUNT=0
while ! curl -s http://localhost:5678 > /dev/null; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        print_error "n8n failed to start after $MAX_RETRIES attempts"
        exit 1
    fi
    echo -ne "."
    sleep 5
done

print_status "n8n is ready!"

# Step 7: Display access information
echo ""
echo "========================================="
echo "DEPLOYMENT COMPLETE! 🎉"
echo "========================================="
echo ""
echo "Access n8n at: http://localhost:5678 or https://plexie.yourdomain.com"
echo ""
echo "Next Steps:"
echo "1. Import the agent workflows from the workflows/ directory"
echo "2. Create an API credential for LM Studio (http://10.0.0.100:1234/v1)"
echo "3. Test each agent individually before connecting them together"
echo ""
echo "To view logs:"
echo "  docker-compose logs -f n8n"
echo ""
echo "To restart services:"
echo "  docker-compose restart"
echo ""
echo "To stop all services:"
echo "  docker-compose down"
echo ""
