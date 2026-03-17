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
                       └─▶ [splits task.files into 2-file chunks, processes each chunk via 09]
                               │
                               └─▶ 09-Chunk-Processor (per chunk)
                                       │
                                       ├─▶ File API (GET)             → reads existing project files for context
                                       │
                                       ├─▶ [Pass 1]
                                       │     ├─▶ 02-Code Writer Agent  → direct HTTP to LM Studio (qwen2.5-coder-32b)
                                       │     ├─▶ Merge Files
                                       │     ├─▶ 08-Combined Reviewer  → single call: security + quality (JSON)
                                       │     └─▶ Review Gate           → pass if (job_complete OR score ≥ 80) AND no critical issues
                                       │
                                       ├─▶ [Pass 2 — if gate fails]
                                       │     └─▶ Code Writer with previous_feedback injected → write regardless
                                       │
                                       └─▶ File API (POST)            → writes chunk files to /home/will/src/{project_id}/
        │
        ├─▶ 06-Project-Memory (operation: 'set')  → updates completed tasks and file manifest
        │
        └─▶ Response
```

**Supporting workflows:**
- **05-Error Logger** — logs errors to disk via File API (`system-logs` project, `_logs/errors/`)
- **06-Project Memory** — persists goal, completed tasks, and file manifest per `project_id`
- **07-Task Processor** — splits `task.files` into 2-file chunks and loops through them via 09
- **08-Combined Reviewer** — unified security + quality review in a single LLM call (replaces 03 + 04)
- **09-Chunk Processor** — runs the full code → review → fix → write pipeline per file chunk (up to 2 passes)
- **10-Research Agent** — optional; fetches library docs from Context7 MCP (`http://docky:8811/mcp`) to inject into code generation context

## Requirements

- **n8n** running on Docker (shared Docker network `shared_net`)
- **LM Studio** running at `http://10.0.0.100:1234` with models loaded and server started
- **File API** running on Docker (see `docker/stacks/file-api/`)
- **docky** (optional) — Context7 MCP server at `http://docky:8811/mcp` for library doc fetching (used by 10-Research-Agent)

> Redis is not required. All agents use direct HTTP calls to LM Studio.

---

## Setup

### 1. Deploy n8n

```bash
cp .env.example .env
# Edit .env — set DOMAIN_NAME, N8N_EDITOR_BASE_URL, WEBHOOK_URL, LLM_API_KEY, FILE_API_TOKEN
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

You need two models loaded simultaneously:
- **`qwen/qwen3.5-9b`** — used by Planner, Combined Reviewer
- **`qwen/qwen2.5-coder-32b-instruct`** — used by Code Writer

Models are hardcoded per-agent. To change them, edit the `jsCode` in each workflow's `Build Request` (or `Prepare Message`) node.

Set `LLM_API_KEY` in your `.env` to your LM Studio API key. All agents send `Authorization: Bearer $env.LLM_API_KEY` in HTTP requests.

---

## Import Workflows

Import in this order so the Master Orchestrator can reference the correct workflow IDs:

| Order | File | Purpose |
|-------|------|---------|
| 1 | `workflows/01-Planner-Agent.json` | Task breakdown |
| 2 | `workflows/02-Code-Writer-Agent.json` | Code generation (direct HTTP to LM Studio) |
| 3 | `workflows/03-Security-Reviewer-Agent.json` | Security review (standalone; not used in main pipeline) |
| 4 | `workflows/04-Quality-Reviewer-Agent.json` | Quality review (standalone; not used in main pipeline) |
| 5 | `workflows/05-Error-Logger-Agent.json` | Error logging |
| 6 | `workflows/06-Project-Memory.json` | Persistent project state |
| 7 | `workflows/08-Combined-Reviewer-Agent.json` | Combined security + quality review (used by 09) |
| 8 | `workflows/09-Chunk-Processor.json` | Per-chunk code → review → write pipeline |
| 9 | `workflows/07-Task-Processor.json` | Chunk orchestrator (calls 09) |
| 10 | `workflows/10-Research-Agent.json` | Library doc fetcher (optional) |
| 11 | `workflows/00-Master-Orchestrator.json` | Entry point (import last) |

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
      "chunks_processed": 1,
      "fixed": false
    }
  ],
  "files_written": ["package.json", "src/index.ts", "src/auth.ts", "..."]
}
```

Generated files are on disk at `/home/will/src/{project_id}/`.

---

## How the Workflows Work

### Planner (01)

Direct HTTP call pattern:

```
Execute Workflow Trigger → Code (Build Request) → HTTP Request (LM Studio) → Code (Parse Response)
```

### Code Writer Agent (02)

Direct HTTP call pattern:

```
Execute Workflow Trigger → Code (Prepare Message) → HTTP Request (LM Studio) → Code (Parse Response)
```

- Model: `qwen/qwen2.5-coder-32b-instruct`
- The system message + user message contains the full task description, `files` constraint, and existing file contents
- On retry (P2), the same full context is re-sent with `previous_feedback` appended (no session memory required)
- The `files` array from the Planner task is injected as a "FILES TO MODIFY" constraint to prevent the model from regenerating unrelated files

### Combined Reviewer Agent (08)

Replaces the separate Security (03) and Quality (04) reviewers with a single call:

```
Execute Workflow Trigger → Code (Build Request) → HTTP Request (LM Studio) → Code (Parse Response)
```

- Model: `qwen/qwen3.5-9b`
- Returns: `quality_score` (0–100), `job_complete` (bool), `security_issues[]`, `quality_improvements[]`
- All fields combined in one JSON response

### Task Processor (07) — Chunk Orchestrator

```
Execute Workflow Trigger
        │
        └─▶ Split Into Chunks   → splits task.files into groups of 2
                │
                └─▶ [loop] Call Chunk Processor (09) → Store Result → Has More Chunks?
                                                                        ├─▶ yes: Get Next Chunk → loop
                                                                        └─▶ no: Collect Results → Build Result
```

Uses n8n `getWorkflowStaticData('global')` to queue and loop through chunks sequentially.

### Chunk Processor (09) — 2-Pass Quality Gate

```
Read Existing Files → Build Code Input → Call Code Writer → Merge For Review → Call Combined Reviewer → Review Gate
                                                                                                          │
                                                                                     ├─▶ Pass: Prepare Write → Write Files
                                                                                     └─▶ Fail: Build Retry Input → Call Code Writer Retry → Prepare Write → Write Files
```

**Gate condition:** `(job_complete === true OR quality_score >= 80) AND critical_issues.length === 0`

After 2 passes (P1 → P2), files are written regardless of review outcome.

If the reviewer returns unparseable output, the code is accepted as-is rather than retrying.

**File handling:**
- Only files in `chunk_files` are fetched from disk and sent as context
- After code generation, existing files and new files are merged before review
- `package.json` and `client/package.json` dependencies are merged additively — new deps are added, not replaced
- Write guardrail: only files matching `chunk_files` (or genuinely new files) are written to disk

### Research Agent (10) — Library Doc Fetcher

Optional workflow that fetches up-to-date library documentation from the Context7 MCP server at `http://docky:8811/mcp`:

```
Execute Workflow Trigger → Extract Libraries → Init MCP Session → Build Resolve Requests → Should Skip?
                                                                                             │
                                                                    ├─▶ no libraries: Skip Output (empty _reference)
                                                                    └─▶ libraries found: Fetch All Docs → returns _reference
```

- Scans `task.description`, `task.files`, and `plan_document` for library name hints
- Detects: React, HeroUI, Tailwind, Vite, Next.js, Express, Prisma, Drizzle, Fastify, Hono, Zod, tRPC, Framer Motion
- Fetches up to 3 libraries, 5000 tokens of docs each
- Outputs `_reference` field containing combined documentation for injection into the Code Writer prompt
- Skips gracefully if docky is unavailable or no libraries are detected

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

Models are hardcoded per-agent. To change them, edit the `jsCode` in each workflow's `Build Request` (Planner/Combined Reviewer) or `Prepare Message` (Code Writer) node.

**Models and settings:**

| Agent | Model | max_tokens | temperature | Notes |
|-------|-------|-----------|------------|-------|
| Planner | `qwen/qwen3.5-9b` | 8192 | 0.7 | Direct HTTP |
| Code Writer | `qwen/qwen2.5-coder-32b-instruct` | 16000 | 0.7 | Direct HTTP, 300s timeout |
| Combined Reviewer | `qwen/qwen3.5-9b` | 4096 | 0.3 | Direct HTTP, 120s timeout |

**Auth:** All HTTP Request nodes use `Authorization: Bearer $env.LLM_API_KEY`. Set `LLM_API_KEY` in your n8n environment.

**Qwen3 thinking model support:** All parse-response nodes strip `<think>...</think>` blocks and fall back to `reasoning_content` if `content` is empty.

---

## Task Structure

The Planner outputs tasks in this format:

```json
[
  {
    "task_id": "TASK-001",
    "description": "actionable description of exactly what to implement",
    "files": ["src/routes/auth.ts", "package.json"],
    "dependencies": [],
    "complexity": "low|medium|high"
  },
  {
    "task_id": "TASK-002",
    "description": "depends on TASK-001",
    "files": ["src/middleware/auth.ts"],
    "dependencies": ["TASK-001"],
    "complexity": "medium"
  }
]
```

The `files` array lists the exact file paths this task creates or modifies. The Task Processor splits this array into 2-file chunks, each processed independently by the Chunk Processor.

The Master Orchestrator's **Spread Tasks** node sorts these using Kahn's topological algorithm so dependents always run after their prerequisites.

---

## Customization

### Change the LLM model

Edit the `jsCode` in the `Build Request` node (Planner/Combined Reviewer) or `Prepare Message` node (Code Writer) and update the `model` field. Check available models with `GET http://10.0.0.100:1234/v1/models`.

### Adjust temperature or token limits

- **Planner / Combined Reviewer:** Edit the `Build Request` Code node in each sub-workflow
- **Code Writer:** Edit the `Prepare Message` Code node — the `temperature` and `max_tokens` fields are in the returned object

### Modify system prompts

- **Planner / Combined Reviewer:** Edit the `content` string in the `Build Request` Code node
- **Code Writer:** Edit the `systemMessage` variable in the `Prepare Message` Code node

### Adjust quality gate threshold

In `09-Chunk-Processor`, find the **Review Gate** Code node and change:
```js
shouldPass = (jobComplete || score >= 80) && criticalCount === 0;
```

The gate passes primarily via `job_complete === true` from the Combined Reviewer. To lower the score fallback, change `80` to a lower value (e.g. `7` for a 0–10 scale).

### Change chunk size

In `07-Task-Processor`, find the **Split Into Chunks** Code node and change:
```js
const chunkSize = 2;
```

Smaller chunks reduce token usage per call. Larger chunks mean fewer Code Writer invocations.

---

## Troubleshooting

**Webhook returns 404**

n8n 2.10+ prepends the workflow ID to the webhook path. The correct URL format is:
```
/webhook/{workflowId}/webhook/{path}
```
Find the exact URL in n8n → open the Master Orchestrator → click the Webhook node → copy the production URL.

**LM Studio returns 401**

Each HTTP Request node sends `Authorization: Bearer $env.LLM_API_KEY`. Set `LLM_API_KEY` in your n8n environment variables to match your LM Studio API key.

**Empty responses from the model**

Qwen3 thinking models put output in `reasoning_content`, leaving `content` empty. Fixes already in place:
1. Prompts end with `/nothink` to disable chain-of-thought
2. All parse-response nodes strip `<think>` blocks and fall back to `reasoning_content`
3. Increase `max_tokens` if responses are still truncated

**Sub-workflow not found**

Confirm all workflows are imported and **activated**, then verify the workflow IDs in the Execute Workflow nodes match your n8n instance.

**File API returns 401**

Check that `FILE_API_TOKEN` in your `.env` matches the Bearer token in the **Write Files to Disk** HTTP node in `09-Chunk-Processor`.

**Code Writer not reflecting previous feedback**

The Code Writer uses no session memory. On P2 retries, the full task context plus `previous_feedback` is re-sent in the same request. If feedback isn't being applied, check the `Build Retry Input` node output in `09-Chunk-Processor` to confirm `previous_feedback` is populated.

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
    ├── 02-Code-Writer-Agent.json       ← direct HTTP to LM Studio
    ├── 03-Security-Reviewer-Agent.json ← standalone; not used in main pipeline
    ├── 04-Quality-Reviewer-Agent.json  ← standalone; not used in main pipeline
    ├── 05-Error-Logger-Agent.json
    ├── 06-Project-Memory.json
    ├── 07-Task-Processor.json          ← chunk orchestrator (calls 09 in a loop)
    ├── 08-Combined-Reviewer-Agent.json ← unified security + quality review
    ├── 09-Chunk-Processor.json         ← per-chunk code → review → write pipeline
    └── 10-Research-Agent.json          ← optional library doc fetcher (Context7 MCP)
```
