#!/bin/bash
# Deployment Script for n8n Multi-Agent Coding Pipeline
# Deploys: file-api, forge, n8n, and workflow configuration

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }
err()  { echo -e "${RED}✗${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOCKER_COMPOSE="docker compose"
command -v docker-compose &>/dev/null && DOCKER_COMPOSE="docker-compose"

echo "==========================================="
echo " n8n Multi-Agent Pipeline — Deploy"
echo "==========================================="

# --- Prerequisites ---
echo ""
echo "Checking prerequisites..."

for cmd in docker git curl; do
  command -v $cmd &>/dev/null || { err "$cmd is not installed"; exit 1; }
done
$DOCKER_COMPOSE version &>/dev/null || { err "Docker Compose not available"; exit 1; }
ok "docker, git, curl, docker compose"

# --- Environment ---
echo ""
echo "Checking environment..."

ENV_FILE="$SCRIPT_DIR/workflows/.env"
if [ ! -f "$ENV_FILE" ]; then
  if [ -f "$SCRIPT_DIR/.env.example" ]; then
    cp "$SCRIPT_DIR/.env.example" "$ENV_FILE"
    warn "Created workflows/.env from .env.example — edit it with your values before continuing"
    echo "  Required: LLM_API_KEY, LM_STUDIO_URL, FILE_API_TOKEN, N8N_API_KEY"
    exit 1
  else
    err "No .env.example found. Create workflows/.env manually (see README)."
    exit 1
  fi
fi
ok "workflows/.env exists"

# Source env vars for use in this script
set -a; source "$ENV_FILE"; set +a

# --- Docker network ---
echo ""
echo "Ensuring shared_net Docker network..."

docker network inspect shared_net &>/dev/null || docker network create shared_net
ok "shared_net network ready"

# --- File API ---
echo ""
echo "Deploying file-api..."

cd "$SCRIPT_DIR/file-api"
$DOCKER_COMPOSE up -d --build
ok "file-api container running"

# Verify health
sleep 2
if curl -sf -H "Authorization: Bearer ${FILE_API_TOKEN}" http://localhost:3456/health &>/dev/null; then
  ok "file-api health check passed"
else
  warn "file-api health check failed — it may still be starting"
fi

# --- Forge ---
echo ""
echo "Deploying forge dashboard..."

cd "$SCRIPT_DIR/forge"
$DOCKER_COMPOSE up -d --build
ok "forge container running"

sleep 2
if curl -sf http://localhost:3500 &>/dev/null; then
  ok "forge health check passed (http://localhost:3500)"
else
  warn "forge health check failed — it may still be starting"
fi

# --- n8n ---
echo ""
echo "Checking n8n..."

N8N_DIR="/docker/stacks/n8n"
if [ -d "$N8N_DIR" ]; then
  # Copy pipeline env vars to n8n's .env if it exists
  if [ -f "$N8N_DIR/.env" ]; then
    ok "n8n stack found at $N8N_DIR"
    echo "  Ensure these vars are in $N8N_DIR/.env and passed through n8n.yml:"
    echo "    LM_STUDIO_URL, PLANNER_MODEL, CODER_MODEL, REVIEWER_MODEL"
    echo "    FILE_API_URL, FILE_API_TOKEN, MCP_GATEWAY_URL, LLM_API_KEY"
  fi

  # Restart n8n to pick up any env changes
  cd "$N8N_DIR"
  $DOCKER_COMPOSE restart n8n 2>/dev/null && ok "n8n restarted" || warn "Could not restart n8n"
else
  warn "n8n stack not found at $N8N_DIR — deploy n8n separately"
fi

# Wait for n8n
echo ""
echo "Waiting for n8n..."
for i in $(seq 1 20); do
  curl -sf http://localhost:5678 &>/dev/null && break
  echo -n "."
  sleep 3
done
echo ""

if curl -sf http://localhost:5678 &>/dev/null; then
  ok "n8n is ready"
else
  warn "n8n not reachable at localhost:5678 — check manually"
fi

# --- Workflow import ---
echo ""
echo "Importing workflows..."

N8N_API="http://localhost:5678/api/v1"
AUTH_HEADER="X-N8N-API-KEY: ${N8N_API_KEY}"

WORKFLOW_ORDER=(
  "01-Planner-Agent"
  "02-Code-Writer-Agent"
  "03-Project-Memory"
  "04-Task-Processor"
  "05-Combined-Reviewer-Agent"
  "06-Chunk-Processor"
  "07-Research-Agent"
  "00-Master-Orchestrator"
)

for wf_name in "${WORKFLOW_ORDER[@]}"; do
  wf_file="$SCRIPT_DIR/workflows/${wf_name}.json"
  if [ -f "$wf_file" ]; then
    RESULT=$(curl -sf -X POST "$N8N_API/workflows" \
      -H "$AUTH_HEADER" \
      -H "Content-Type: application/json" \
      -d @"$wf_file" 2>&1) && ok "Imported $wf_name" || warn "Failed to import $wf_name (may already exist)"
  else
    warn "File not found: $wf_file"
  fi
done

echo ""
echo "==========================================="
echo " Deployment complete"
echo "==========================================="
echo ""
echo "Next steps:"
echo "  1. Open n8n at http://localhost:5678"
echo "  2. Activate all imported workflows"
echo "  3. Update workflow IDs in workflows/.env (WF_* vars)"
echo "  4. Verify LM Studio is running: curl ${LM_STUDIO_URL:-http://10.0.0.100:1234/v1/chat/completions}"
echo "  5. Open Forge at http://localhost:3500 to submit jobs"
echo "  6. Or test via curl: POST to the Master Orchestrator webhook (see README)"
echo ""
