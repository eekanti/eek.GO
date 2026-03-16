# AI Coding Agents - Multi-Agent System

A complete multi-agent coding assistant running locally via **n8n** + **LM Studio**. Send a message describing what you want to build — the system plans, writes, reviews, fixes, and writes the files to disk automatically.

## Architecture

```
POST /webhook/{workflowId}/webhook/coding-agent
        │
        ▼
00-Master-Orchestrator
        │
        ├─▶ 06-Project-Memory (operation: 'init')  → loads or creates persistent project state
        │
        ├─▶ 01-Planner Agent      → breaks request into structured tasks (JSON array with dependencies)
        │
        ├─▶ Spread Tasks          → topological sort (Kahn's algorithm) respects task.dependencies[]
        │
        └─▶ [each task in order]
               │
               └─▶ 07-Task-Processor
                       │
                       ├─▶ File API (GET)             → reads existing project files for context
                       │
                       ├─▶ [Pass 1]
                       │     ├─▶ 02-Code Writer Agent  → LangChain agent + Redis session memory
                       │     ├─▶ 03-Security Reviewer  → OWASP review (JSON score + issues)
                       │     ├─▶ 04-Quality Reviewer   → docs/tests/architecture review (JSON score)
                       │     └─▶ Quality Gate          → pass if score ≥ 8 AND no critical issues
                       │
                       ├─▶ [Pass 2 — if gate fails]
                       │     └─▶ Same pipeline with previous_feedback injected
                       │
                       ├─▶ [Pass 3 — if gate fails again]
                       │     └─▶ Final attempt; proceeds to write regardless
                       │
                       ├─▶ File API (POST)            → writes files to /home/will/src/{project_id}/
                       └─▶ Returns task result
        │
        ├─▶ 06-Project-Memory (operation: 'set')  → updates completed tasks and file manifest
        │
        └─▶ Response
```

**Supporting workflows:**
- **05-Error Logger** — available for error tracking; wire in manually if needed
- **06-Project Memory** — persists goal, completed tasks, and file manifest per `project_id`
- **07-Task Processor** — runs the full code → review → fix → write pipeline per task (up to 3 passes)

## Requirements

- **n8n** running on Docker (shared Docker network `shared_net`)
- **LM Studio** running at `http://10.0.0.100:1234` with a model loaded and server started
- **Redis** accessible to n8n (used by Code Writer Agent for session memory)
- **File API** running on Docker (see `docker/stacks/file-api/`)

---

## Setup

### 1. Deploy n8n

```bash
cp .env.example .env
# Edit .env — set DOMAIN_NAME, N8N_EDITOR_BASE_URL, WEBHOOK_URL
chmod +x deploy.sh
sudo ./deploy.sh
```

### 2. Deploy File API

```bash
cd /docker/stacks/file-api
# Set FILE_API_TOKEN in your .env
docker compose up -d
```

The File API mounts `/home/will/src` as `/projects` inside the container. Generated project files are written to `/home/will/src/{project_id}/`.

### 3. Verify LM Studio

```bash
curl http://10.0.0.100:1234/v1/models
```

Set `LOCAL_AI_MODEL` in your environment (or n8n's environment variables) to your loaded model's identifier. All prompts end with `/nothink` to suppress chain-of-thought tokens on thinking models like Qwen3.

---

## Import Workflows

Import in this order so the Master Orchestrator can reference the correct workflow IDs:

| Order | File | Purpose |
|-------|------|---------|
| 1 | `workflows/01-Planner-Agent.json` | Task breakdown |
| 2 | `workflows/02-Code-Writer-Agent.json` | Code generation (LangChain agent + Redis memory) |
| 3 | `workflows/03-Security-Reviewer-Agent.json` | Security review |
| 4 | `workflows/04-Quality-Reviewer-Agent.json` | Quality review |
| 5 | `workflows/05-Error-Logger-Agent.json` | Error logging |
| 6 | `workflows/06-Project-Memory.json` | Persistent project state |
| 7 | `workflows/07-Task-Processor.json` | Per-task pipeline with 3-pass retry |
| 8 | `workflows/00-Master-Orchestrator.json` | Entry point (import last) |

After importing, open each workflow and **activate** it. Then open `00-Master-Orchestrator` and update the workflow IDs in the Execute Workflow nodes to match the actual IDs assigned by your n8n instance.

---

## Usage

### New project

```bash
curl -X POST https://n8n.hiwill.io/webhook/{masterOrchestratorId}/webhook/coding-agent \
  -H "Content-Type: application/json" \
  -d '{"message": "Create a user authentication API with login and registration endpoints"}'
```

> **Note:** n8n 2.10+ prepends the workflow ID to the webhook path. Check the Webhook node in the Master Orchestrator for the exact URL.

### Continue an existing project

```bash
curl -X POST https://n8n.hiwill.io/webhook/{masterOrchestratorId}/webhook/coding-agent \
  -H "Content-Type: application/json" \
  -d '{"message": "Add JWT refresh token support", "project_id": "proj-1234567890"}'
```

Passing the same `project_id` loads the existing project goal and file manifest from memory, so the model has context about what was already built.

### Response

```json
{
  "status": "completed",
  "project_id": "proj-1234567890",
  "project_goal": "Create a user authentication API...",
  "tasks_completed": 5,
  "task_results": [
    {
      "task_id": "TASK-001",
      "description": "Initialize Node.js project",
      "files_written": ["package.json", "src/index.ts"],
      "security_review": { "security_score": 9, "critical_issues": [] },
      "quality_review": { "quality_score": 8 },
      "fixed": false
    }
  ],
  "files_written": ["package.json", "src/index.ts", "src/auth.ts", "..."]
}
```

Generated files are on disk at `/home/will/src/{project_id}/`.

---

## How the Workflows Work

### Planner, Security Reviewer, Quality Reviewer (01, 03, 04)

Direct HTTP call pattern — no LangChain:

```
Execute Workflow Trigger → Code (Build Request) → HTTP Request (LM Studio) → Code (Parse Response)
```

### Code Writer Agent (02)

LangChain agent with Redis session memory:

```
Execute Workflow Trigger → Code (Prepare Message) → LangChain Agent → Code (Parse Response)
                                                          │
                                              LM Studio Chat Model + Redis Chat Memory
```

- **Redis session key:** `{project_id}-{task_id}` (TTL: 3600s)
- On P2/P3 retries, the Code Writer receives only the feedback message — the agent recalls its prior code from Redis session history
- On first run (P1), it receives the full task description, project goal, and existing file contents

### Task Processor — 3-Pass Quality Gate

```
P1: Code Writer → Security Review → Quality Review → Gate
                                                       ├─▶ Pass (score ≥ 8, no critical issues): write files
                                                       └─▶ Fail: P2 with feedback

P2: Code Writer → Security Review → Quality Review → Gate
                                                       ├─▶ Pass: write files
                                                       └─▶ Fail: P3 with feedback

P3: Code Writer → Security Review → Quality Review → write files (no further retries)
```

If both reviewers return unparseable output, the code is accepted as-is rather than retrying indefinitely.

File merging: generated files from Code Writer override matching paths from disk, then all are written together.

### Project Memory (06)

Supports three operations called by the Master Orchestrator:

| Operation | When | Effect |
|-----------|------|--------|
| `init` | Start of run | Creates project record (skips if already exists) |
| `get` | (direct lookup) | Returns stored state for a `project_id` |
| `set` | End of run | Merges completed tasks and file list into stored state |

Storage: `getWorkflowStaticData('global')` — persists across n8n restarts as long as the workflow is not re-imported.

---

## LLM Configuration

**Model:** Set `LOCAL_AI_MODEL` env var in n8n to your loaded model's identifier (e.g. `qwen/qwen3.5-35b-a3b`).

**Token limits and temperatures:**

| Agent | max_tokens | temperature | Notes |
|-------|-----------|------------|-------|
| Planner | 4096 | 0.7 | Direct HTTP |
| Code Writer | 16000 | 0.7 | LangChain + Redis |
| Security Reviewer | 2048 | 0.3 | Direct HTTP |
| Quality Reviewer | 2048 | 0.3 | Direct HTTP |

**Qwen3 thinking model support:** All parse-response nodes strip `<think>...</think>` blocks and fall back to `reasoning_content` if `content` is empty. Prompts end with `/nothink` to disable chain-of-thought by default.

---

## Task Structure

The Planner outputs tasks in this format:

```json
[
  {
    "task_id": "TASK-001",
    "description": "actionable description",
    "dependencies": [],
    "complexity": "low|medium|high"
  },
  {
    "task_id": "TASK-002",
    "description": "depends on TASK-001",
    "dependencies": ["TASK-001"],
    "complexity": "medium"
  }
]
```

The Master Orchestrator's **Spread Tasks** node sorts these using Kahn's topological algorithm so dependents always run after their prerequisites.

---

## Customization

### Change the LLM model

Set `LOCAL_AI_MODEL` in n8n's environment variables to match your loaded model's identifier from `GET http://10.0.0.100:1234/v1/models`.

### Adjust temperature or token limits

- **Planner / Security / Quality:** Edit the `Build Request` Code node in each sub-workflow
- **Code Writer:** Edit the `LM Studio Chat Model` node's options

### Modify system prompts

- **Planner / Security / Quality:** Edit the `content` string in the `Build Request` Code node
- **Code Writer:** Edit the system prompt in the `Code Writer Agent` (LangChain agent node) system message

### Adjust quality gate threshold

In `07-Task-Processor`, find the **Quality Gate 1** and **Quality Gate 2** Code nodes and change:
```js
quality_score >= 8 && critical_issues.length === 0
```

---

## Troubleshooting

**Webhook returns 404**

n8n 2.10+ prepends the workflow ID to the webhook path. The correct URL format is:
```
/webhook/{workflowId}/webhook/{path}
```
Find the exact URL in n8n → open the Master Orchestrator → click the Webhook node → copy the production URL.

**LM Studio returns 401**

Each HTTP Request node needs `Authorization: Bearer <your-api-key>` in the Headers. The key is stored as `LM_STUDIO_API_KEY`. For the Code Writer, check the `LM Studio Chat Model` node's credential configuration.

**Empty responses from the model**

Qwen3 thinking models put output in `reasoning_content`, leaving `content` empty. Fixes already in place:
1. Prompts end with `/nothink` to disable chain-of-thought
2. All parse-response nodes strip `<think>` blocks and fall back to `reasoning_content`
3. Increase `max_tokens` if responses are still truncated

**Sub-workflow not found**

Confirm all workflows are imported and **activated**, then verify the workflow IDs in the Execute Workflow nodes match your n8n instance.

**File API returns 401**

Check that `FILE_API_TOKEN` in your `.env` matches the Bearer token in the **Write Files to Disk** HTTP node in `07-Task-Processor`.

**Code Writer not remembering previous pass**

Redis must be running and accessible to n8n. The session key is `{project_id}-{task_id}` with a 1-hour TTL. Check the Redis Chat Memory node's credential configuration.

**Files not appearing on disk**

```bash
docker ps | grep file-api
curl -H "Authorization: Bearer <token>" http://localhost:3456/health
```

Files land at `/home/will/src/{project_id}/`. The File API runs as the `node` Docker user — use `sudo` or the File API's DELETE endpoint to remove them from the host.

---

## File Structure

```
n8n-team/
├── docker-compose.yml
├── .env.example
├── deploy.sh
├── README.md
├── docs/
│   └── Troubleshooting Guide.md
└── workflows/
    ├── 00-Master-Orchestrator.json     ← import last; update workflow IDs
    ├── 01-Planner-Agent.json
    ├── 02-Code-Writer-Agent.json       ← LangChain agent with Redis session memory
    ├── 03-Security-Reviewer-Agent.json
    ├── 04-Quality-Reviewer-Agent.json
    ├── 05-Error-Logger-Agent.json
    ├── 06-Project-Memory.json
    └── 07-Task-Processor.json
```
