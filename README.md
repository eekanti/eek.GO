# AI Coding Agents - Multi-Agent System

A complete multi-agent coding assistant running locally via **n8n** + **LM Studio**. Send a message describing what you want to build — the system plans, writes, reviews, fixes, and writes the files to disk automatically.

## Architecture

```
POST /webhook/{workflowId}/webhook/coding-agent
        │
        ▼
00-Master-Orchestrator
        │
        ├─▶ 06-Project-Memory     → loads or initializes persistent project state
        │
        ├─▶ 01-Planner Agent      → breaks request into structured tasks (JSON array)
        │
        └─▶ [loop each task]
               │
               └─▶ 07-Task-Processor
                       │
                       ├─▶ 02-Code Writer Agent    → generates code as [{path, content}] JSON
                       ├─▶ 03-Security Reviewer    → OWASP Top 10 review (JSON score + issues)
                       ├─▶ 04-Quality Reviewer     → docs, tests, architecture review (JSON score)
                       ├─▶ [if issues found] → re-runs Code Writer with feedback
                       └─▶ File API               → writes files to /home/will/src/{project_id}/
```

- **05-Error Logger** — available for error tracking; wire in manually if needed
- **06-Project Memory** — persists goal, completed tasks, and file manifest across runs
- **07-Task Processor** — runs the full code→review→fix→write pipeline per task

## Requirements

- **n8n** running on Docker (shared Docker network `shared_net`)
- **LM Studio** running at `http://10.0.0.100:1234` with a model loaded and server started
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

The workflows use `qwen/qwen3.5-35b-a3b`. Update the `Build Request` Code node in each workflow if your model identifier differs. All prompts end with `/nothink` to suppress chain-of-thought tokens.

---

## Import Workflows

Import in this order so the Master Orchestrator can reference the correct workflow IDs:

| Order | File | Purpose |
|-------|------|---------|
| 1 | `workflows/01-Planner-Agent.json` | Task breakdown |
| 2 | `workflows/02-Code-Writer-Agent.json` | Code generation (outputs `[{path, content}]`) |
| 3 | `workflows/03-Security-Reviewer-Agent.json` | Security review |
| 4 | `workflows/04-Quality-Reviewer-Agent.json` | Quality review |
| 5 | `workflows/05-Error-Logger-Agent.json` | Error logging |
| 6 | `workflows/06-Project-Memory.json` | Persistent project state |
| 7 | `workflows/07-Task-Processor.json` | Per-task pipeline with retry |
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

> **Note:** n8n 2.10+ prepends the workflow ID to the webhook path. Check the Webhook node in the Master Orchestrator for the exact URL, or look it up in n8n's execution log.

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

Each sub-workflow (01–04) follows the same pattern:

```
Execute Workflow Trigger → Code (build LM Studio request) → HTTP Request → Code (parse response)
```

- **No LangChain nodes** — LM Studio called directly via HTTP Request at `http://10.0.0.100:1234/v1/chat/completions`
- **Auth header** — `Authorization: Bearer <LM_STUDIO_API_KEY>` on every LM Studio call
- **Qwen3 thinking model** — prompts end with `/nothink`; parsers fall back to `reasoning_content` if `content` is empty

**Token limits:**

| Agent | max_tokens |
|-------|-----------|
| Planner | 8192 |
| Code Writer | 16384 |
| Security Reviewer | 8192 |
| Quality Reviewer | 8192 |

**Task Processor retry logic:** if `security_score < 6`, `quality_score < 6`, or critical issues are found, the Code Writer is called a second time with the review feedback included in the prompt.

**Project Memory** uses n8n's `getWorkflowStaticData('global')` for persistence — data survives n8n restarts as long as the workflow is not re-imported.

---

## Customization

### Change the LLM model

In each sub-workflow, open the **Build Request** Code node and update:
```js
model: 'qwen/qwen3.5-35b-a3b'
```
to match your loaded model's identifier from `GET http://10.0.0.100:1234/v1/models`.

### Adjust temperature

| Agent | Temperature |
|-------|------------|
| Planner | 0.3 |
| Code Writer | 0.7 |
| Security Reviewer | 0.3 |
| Quality Reviewer | 0.5 |

### Modify system prompts

Edit the `content` string in the **Build Request** Code node of each sub-workflow.

---

## Troubleshooting

**Webhook returns 404**

n8n 2.10+ prepends the workflow ID to the webhook path. The correct URL format is:
```
/webhook/{workflowId}/webhook/{path}
```
Find the exact URL in n8n → open the Master Orchestrator → click the Webhook node → copy the production URL.

**LM Studio returns 401**

Each HTTP Request node needs `Authorization: Bearer <your-api-key>` set in the Headers. Check the **Build LM Studio Request** HTTP node in each sub-workflow.

**Empty responses from the model**

Qwen3 thinking models put output in `reasoning_content`, leaving `content` empty. Fixes:
1. Prompts end with `/nothink` to disable chain-of-thought
2. All parse-response Code nodes fall back to `msg.reasoning_content` if `msg.content` is empty
3. Increase `max_tokens` if responses are still truncated

**Sub-workflow not found**

Confirm all workflows are imported and **activated**, then verify the workflow IDs in the Execute Workflow nodes match your n8n instance.

**File API returns 401**

Check that `FILE_API_TOKEN` in your `.env` matches the Bearer token hardcoded in the **Write Files to Disk** HTTP node in `07-Task-Processor`.

---

## File Structure

```
n8n-team/
├── docker-compose.yml
├── .env.example
├── deploy.sh
├── README.md
└── workflows/
    ├── 00-Master-Orchestrator.json     ← import last; update workflow IDs
    ├── 01-Planner-Agent.json
    ├── 02-Code-Writer-Agent.json
    ├── 03-Security-Reviewer-Agent.json
    ├── 04-Quality-Reviewer-Agent.json
    ├── 05-Error-Logger-Agent.json
    ├── 06-Project-Memory.json
    └── 07-Task-Processor.json
```
