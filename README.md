# n8n Multi-Agent Coding Pipeline

A local multi-agent coding assistant powered by **n8n** and **LM Studio**. Send a natural-language request — the system plans tasks, generates code, reviews it, and writes files to disk automatically.

## Architecture

```
POST /webhook/{workflowId}/webhook/coding-agent
        │
        ▼
00 Master Orchestrator
        │
        ├─▶ 03 Project Memory (init)     → load/create persistent project state
        │
        ├─▶ 07 Research Agent (optional)  → fetch library docs from Context7 MCP
        │
        ├─▶ 01 Planner Agent             → break request into tasks [{task_id, description, files, dependencies}]
        │
        ├─▶ Spread Tasks                 → topological sort (Kahn's algorithm) on task.dependencies
        │
        └─▶ [each task in dependency order]
               │
               └─▶ 04 Task Processor
                       │
                       └─▶ split task.files into 2-file chunks
                               │
                               └─▶ 06 Chunk Processor (per chunk)
                                       │
                                       ├─▶ File API GET    → read existing files for context
                                       ├─▶ 02 Code Writer  → generate code (Pass 1)
                                       ├─▶ 05 Reviewer     → security + quality review
                                       ├─▶ Review Gate     → pass if (job_complete OR score≥80) AND no criticals
                                       ├─▶ 02 Code Writer  → retry with feedback (Pass 2, if gate fails)
                                       └─▶ File API POST   → write files to /home/will/src/{project_id}/
        │
        ├─▶ 03 Project Memory (set)      → persist completed tasks and file manifest
        └─▶ Response
```

## Workflows

| # | File | Role |
|---|------|------|
| 00 | `Master-Orchestrator.json` | Entry point — webhook, orchestrates all sub-workflows |
| 01 | `Planner-Agent.json` | Breaks request into structured tasks with file lists and dependencies |
| 02 | `Code-Writer-Agent.json` | Generates code via LM Studio (`$env.CODER_MODEL`) |
| 03 | `Project-Memory.json` | Persists project goal, tasks, and file manifest per `project_id` |
| 04 | `Task-Processor.json` | Splits task files into 2-file chunks, loops through Chunk Processor |
| 05 | `Combined-Reviewer-Agent.json` | Unified security + quality review (`$env.REVIEWER_MODEL`) |
| 06 | `Chunk-Processor.json` | Per-chunk pipeline: code → review → fix → write to disk |
| 07 | `Research-Agent.json` | Fetches library docs from Context7 MCP (optional) |

## Requirements

| Service | Purpose | Location |
|---------|---------|----------|
| **n8n** | Workflow engine | `/docker/stacks/n8n/` |
| **LM Studio** | Local LLM server | `http://10.0.0.100:1234` (or your host) |
| **File API** | File CRUD for generated code | `file-api/` (in this repo) |
| **docky** | Context7 MCP for library docs | `http://docky:8811/mcp` (optional) |

All services communicate over the `shared_net` Docker network.

## Setup

### 1. Configure environment

```bash
cp .env.example workflows/.env
# Edit workflows/.env with your actual values:
#   LLM_API_KEY, LM_STUDIO_URL, FILE_API_TOKEN, N8N_API_KEY
```

The single `workflows/.env` file is the source of truth for all pipeline configuration. The file-api reads from it directly. n8n receives the same variables via its own `.env` + compose passthrough.

### 2. Deploy

```bash
chmod +x deploy.sh
./deploy.sh
```

This will:
- Build and start the file-api container
- Restart n8n to pick up env changes
- Import all workflows via the n8n API

### 3. Post-deploy

1. Open n8n at `http://localhost:5678`
2. **Activate** all 8 workflows
3. Copy each workflow's ID from the n8n URL bar and update the `WF_*` variables in `workflows/.env`
4. Verify LM Studio has both models loaded:
   - `qwen/qwen3.5-9b` — Planner, Reviewer
   - `qwen/qwen2.5-coder-32b-instruct` — Code Writer

## Environment Variables

All variables live in `workflows/.env`:

| Variable | Used by | Purpose |
|----------|---------|---------|
| `LLM_API_KEY` | All agents | Bearer token for LM Studio |
| `LM_STUDIO_URL` | 01, 02, 05 | LM Studio chat completions endpoint |
| `PLANNER_MODEL` | 01 | Model for planning (`qwen/qwen3.5-9b`) |
| `CODER_MODEL` | 02 | Model for code generation (`qwen/qwen2.5-coder-32b-instruct`) |
| `REVIEWER_MODEL` | 05 | Model for review (`qwen/qwen3.5-9b`) |
| `FILE_API_URL` | 06 | File API base URL (`http://file-api:3456`) |
| `FILE_API_TOKEN` | 06 | Bearer token for File API |
| `MCP_GATEWAY_URL` | 07 | Context7 MCP endpoint (`http://docky:8811/mcp`) |
| `N8N_API_KEY` | deploy.sh | n8n API key for workflow import |
| `WF_*` | 00, 04, 06 | Cross-workflow references (set after import) |

These are accessed in workflows as `$env.VAR_NAME` in expressions and Code nodes.

## Usage

### Start a new project

```bash
curl -X POST http://localhost:5678/webhook/{workflowId}/webhook/coding-agent \
  -H "Content-Type: application/json" \
  -d '{"message": "Create a REST API with auth endpoints"}'
```

> Find the exact webhook URL in n8n → Master Orchestrator → Webhook node → Production URL.

### Continue an existing project

```bash
curl -X POST http://localhost:5678/webhook/{workflowId}/webhook/coding-agent \
  -H "Content-Type: application/json" \
  -d '{"message": "Add JWT refresh tokens", "project_id": "proj-1234567890"}'
```

Passing the same `project_id` loads existing project state so the model has context about what was already built.

### Output

Files are written to `/home/will/src/{project_id}/`. The response includes task results, files written, and review scores.

## File Structure

```
n8n-team/
├── file-api/                          ← File API service
│   ├── app.js                           Express server: auth, CRUD, batch, search
│   ├── Dockerfile
│   ├── docker-compose.yml               Reads from ../workflows/.env
│   └── package.json
├── workflows/
│   ├── .env                           ← All pipeline config (single source of truth)
│   ├── 00-Master-Orchestrator.json
│   ├── 01-Planner-Agent.json
│   ├── 02-Code-Writer-Agent.json
│   ├── 03-Project-Memory.json
│   ├── 04-Task-Processor.json
│   ├── 05-Combined-Reviewer-Agent.json
│   ├── 06-Chunk-Processor.json
│   └── 07-Research-Agent.json
├── docs/
│   └── Troubleshooting Guide.md
├── .env.example                       ← Template for workflows/.env
├── deploy.sh                          ← Automated deployment script
└── README.md
```

## Troubleshooting

See [docs/Troubleshooting Guide.md](docs/Troubleshooting%20Guide.md) for detailed solutions. Quick checks:

| Problem | Fix |
|---------|-----|
| Webhook 404 | URL must include workflow ID: `/webhook/{id}/webhook/coding-agent` |
| LM Studio 401 | Set `LLM_API_KEY` in n8n env vars to match LM Studio's API key |
| Empty model responses | Qwen3 thinking mode — parse nodes already handle this; increase `max_tokens` if truncated |
| Sub-workflow not found | Activate all workflows; verify `WF_*` IDs match your n8n instance |
| File API 401 | `FILE_API_TOKEN` in `workflows/.env` must match what Chunk Processor sends |
| Files not on disk | Check `docker ps | grep file-api` and hit `/health` endpoint |
