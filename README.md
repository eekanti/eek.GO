# AI Coding Agents - Multi-Agent System

A complete multi-agent coding assistant running locally via **n8n** + **LM Studio**. Agents work in sequence to plan, write, review, and return production-ready code.

## Architecture

```
POST /webhook/coding-agent
        │
        ▼
00-Master-Orchestrator
        │
        ├─▶ 01-Planner Agent        → breaks request into structured tasks (JSON)
        │
        ├─▶ 02-Code Writer Agent    → generates TypeScript/JS/React code
        │
        ├─▶ 03-Security Reviewer    → OWASP Top 10 review (returns JSON score + issues)
        │
        ├─▶ 04-Quality Reviewer     → docs, tests, architecture review (returns JSON score)
        │
        └─▶ Respond to Webhook      → aggregated JSON result
```

Error logging is available via **05-Error Logger Agent** — call it from the master if any agent fails.

## Requirements

- **n8n** running (Docker recommended — see `docker-compose.yml`)
- **LM Studio** running at `http://10.0.0.100:1234` with a model loaded and server started

No n8n credentials or LangChain setup needed. All agents call LM Studio directly via HTTP Request nodes.

---

## Setup

### 1. Deploy n8n

```bash
cp .env.example .env
# Edit .env — set DOMAIN_NAME, N8N_EDITOR_BASE_URL, WEBHOOK_URL
chmod +x deploy.sh
sudo ./deploy.sh
```

Open n8n at `http://localhost:5678`.

### 2. Verify LM Studio

Confirm the server is running and a model is loaded:

```bash
curl http://10.0.0.100:1234/v1/models
```

You should see your loaded model in the response. The workflows use `"model": "local-model"` — update the `Build Request` Code node in each workflow if your model identifier is different.

---

## Import Workflows

Import in this order so the Master can reference the correct workflow IDs:

| Order | File | Purpose |
|-------|------|---------|
| 1 | `workflows/01-Planner-Agent.json` | Task breakdown |
| 2 | `workflows/02-Code-Writer-Agent.json` | Code generation |
| 3 | `workflows/03-Security-Reviewer-Agent.json` | Security review |
| 4 | `workflows/04-Quality-Reviewer-Agent.json` | Quality review |
| 5 | `workflows/05-Error-Logger-Agent.json` | Error logging |
| 6 | `workflows/00-Master-Orchestrator.json` | Entry point (import last) |

To import each workflow in n8n:
1. Click **"Add Workflow"** → **"Import from File"** (or paste JSON)
2. Activate the workflow after import

### Wire up the Master Orchestrator

After importing all sub-workflows, **note each workflow's ID** (visible in the URL when editing: `/workflow/1234`).

Open `00-Master-Orchestrator` and replace the four placeholders in the Execute Workflow nodes:

| Placeholder | Replace with |
|-------------|-------------|
| `REPLACE_WITH_PLANNER_WORKFLOW_ID` | ID of 01-Planner-Agent |
| `REPLACE_WITH_CODE_WRITER_WORKFLOW_ID` | ID of 02-Code-Writer-Agent |
| `REPLACE_WITH_SECURITY_REVIEWER_WORKFLOW_ID` | ID of 03-Security-Reviewer-Agent |
| `REPLACE_WITH_QUALITY_REVIEWER_WORKFLOW_ID` | ID of 04-Quality-Reviewer-Agent |

You can edit the IDs directly in the Execute Workflow node settings in the n8n editor, or find/replace them in the JSON before importing.

---

## Usage

Send a POST request to the webhook:

```bash
curl -X POST http://localhost:5678/webhook/coding-agent \
  -H "Content-Type: application/json" \
  -d '{"message": "Create a user authentication API with login and registration endpoints"}'
```

The response includes:

```json
{
  "status": "completed",
  "tasks": [...],
  "generated_code": "...",
  "security_review": {
    "security_score": 8,
    "critical_issues": [],
    "high_priority": [...],
    "recommendations": [...]
  },
  "quality_review": {
    "quality_score": 7,
    "strengths": [...],
    "areas_for_improvement": [...],
    "recommendations": [...]
  }
}
```

---

## How the Workflows Work

Each sub-workflow follows the same pattern:

```
Execute Workflow Trigger → Code (build HTTP body) → HTTP Request (LM Studio) → Code (parse response)
```

- **No LangChain nodes** — LM Studio is called directly via HTTP Request at `http://10.0.0.100:1234/v1/chat/completions`
- **No n8n credentials needed** — the URL is hardcoded in each workflow's HTTP Request node
- Sub-workflows are called via `executeWorkflowTrigger` (not `manualTrigger`) so the Master can invoke them

The Master re-injects the `code` field before calling the Quality Reviewer since the Security Reviewer's output does not pass through the original code.

---

## Customization

### Change the LLM model

In each sub-workflow, open the **"Build Request"** Code node and change:
```js
model: 'local-model'
```
to match the exact model identifier returned by `GET http://10.0.0.100:1234/v1/models`.

### Adjust temperature

| Agent | Current Temperature | Effect |
|-------|-------------------|--------|
| Planner | 0.3 | Structured, deterministic |
| Code Writer | 0.7 | Balanced creativity |
| Security Reviewer | 0.3 | Conservative, catches more issues |
| Quality Reviewer | 0.5 | Balanced assessment |

Edit the `temperature` value in each workflow's **"Build Request"** Code node.

### Modify system prompts

Edit the `content` string inside the **"Build Request"** Code node of each sub-workflow.

---

## Troubleshooting

**LM Studio connection fails**
```bash
curl http://10.0.0.100:1234/v1/models
# Should return a list of loaded models
# If not: check LM Studio server is started and firewall allows port 1234
```

**Sub-workflow not found / Execute Workflow errors**
- Confirm all 5 sub-workflows are imported and **activated**
- Confirm the workflow IDs in the Master match the actual IDs in n8n

**n8n won't start**
```bash
docker-compose logs -f n8n
docker-compose restart
```

---

## File Structure

```
n8n-team/
├── docker-compose.yml
├── .env.example
├── deploy.sh
├── README.md
├── QUICKSTART.md
├── AI_CODING_AGENTS_OVERVIEW.md
├── docs/
└── workflows/
    ├── 00-Master-Orchestrator.json       ← import last; wire up workflow IDs
    ├── 01-Planner-Agent.json
    ├── 02-Code-Writer-Agent.json
    ├── 03-Security-Reviewer-Agent.json
    ├── 04-Quality-Reviewer-Agent.json
    └── 05-Error-Logger-Agent.json
```
