# Troubleshooting Guide

## LM Studio Connection

### "Failed to connect to LM Studio"

```bash
curl -v $LM_STUDIO_URL  # default: http://10.0.0.100:1234/v1/chat/completions
```

1. Open LM Studio → **Server** tab → select model → **Start Server**
2. Check firewall allows port 1234 inbound
3. If the IP changed, update `LM_STUDIO_URL` in `workflows/.env` and restart n8n

### 401 Unauthorized

All agents send `Authorization: Bearer $env.LLM_API_KEY`. Set `LLM_API_KEY` in `workflows/.env` (and in n8n's environment) to match the API key in LM Studio → Server → API Key.

### Empty / blank responses

Qwen3 thinking models put output in `reasoning_content`, leaving `content` empty. All parse-response Code nodes already handle this:
- Prompts end with `/nothink` to suppress chain-of-thought
- Parse nodes strip `<think>...</think>` blocks and fall back to `msg.reasoning_content`

If responses are truncated, increase `max_tokens` in the Build Request / Prepare Message node of the failing workflow.

---

## Webhook 404

n8n 2.10+ prepends the workflow ID to the webhook path:
```
/webhook/{workflowId}/webhook/coding-agent
```

Find the correct URL: open Master Orchestrator in n8n → click **Webhook** node → copy the **Production URL**.

---

## Sub-workflow Errors

### "Workflow not found" / Execute Workflow fails

- Confirm the sub-workflow is **activated** (toggle in n8n)
- Confirm the workflow ID matches — check `WF_*` vars in `workflows/.env`
- Call chain: `00` → `01`, `03`, `04`, `07`; `04` → `06`; `06` → `02`, `05`

### Wrong data format

All sub-workflows use Execute Workflow `typeVersion: 1.1`:
```json
{ "__rl": true, "value": "WORKFLOW_ID", "mode": "id" }
```

---

## Code Writer (02)

### Not reflecting previous feedback on retry

The Code Writer is stateless — no session memory. On P2 retry, `previous_feedback` is re-sent with the full context. If feedback isn't being applied:
1. Open the failing execution in n8n
2. Check **Build Retry Input** in `06-Chunk-Processor` — confirm `previous_feedback` is populated
3. Check the retry Code Writer response

### Partial file output

The Code Writer receives a `FILES TO MODIFY` constraint from `task.files`. If the Planner didn't include a `files` array, no constraint is sent and the model may produce extra files.

---

## Chunk Processor (06) / Quality Gate

### Tasks stuck retrying

Gate condition: `(job_complete === true OR quality_score >= 80) AND critical_issues.length === 0`

After 2 passes (P1 → P2), files are written regardless. To adjust, edit the **Review Gate** Code node in `06-Chunk-Processor`.

### Reviewer returns unparseable output

If the Combined Reviewer returns `raw_output` (parse failure), code is accepted as-is. Check LM Studio is returning valid JSON. Increase `max_tokens` in `05-Combined-Reviewer-Agent` if responses appear truncated.

### Chunks not progressing

Task Processor uses `getWorkflowStaticData('global')` to queue chunks. If an execution crashes, stale state may remain. To clear: open `04-Task-Processor` → Settings → clear static data (or re-import the workflow).

---

## File API

The File API lives in `file-api/` and reads config from `workflows/.env`.

### 401 Unauthorized

`FILE_API_TOKEN` in `workflows/.env` must match what `06-Chunk-Processor` sends as `Authorization: Bearer $env.FILE_API_TOKEN`.

### Files not appearing on disk

```bash
docker ps | grep file-api
curl -H "Authorization: Bearer <token>" http://localhost:3456/health
```

Files are written to `/home/will/src/{project_id}/`. The container runs as UID 1000.

### Path traversal blocked (500)

The File API rejects paths that escape the project root. Ensure file paths are relative (e.g., `src/index.ts`).

---

## Research Agent (07)

### Library docs not being fetched

The Research Agent connects to Context7 MCP at `$env.MCP_GATEWAY_URL` (default: `http://docky:8811/mcp`). If docky is down, the agent skips gracefully.

```bash
docker ps | grep docky
```

Supported libraries: React, HeroUI, Tailwind, Vite, Next.js, Express, Prisma, Drizzle, Fastify, Hono, Zod, tRPC, Framer Motion. To add more, edit the **Extract Libraries** Code node in `07-Research-Agent.json`.

---

## Project Memory (03)

### Memory not persisting across restarts

`getWorkflowStaticData('global')` persists as long as the workflow isn't re-imported. Re-importing resets static data.

### Wrong project loaded

Each project is keyed by `project_id`. Always pass the same `project_id` to continue an existing project.

---

## n8n Container

```bash
docker compose -f /docker/stacks/n8n/n8n.yml logs -f n8n    # view logs
docker compose -f /docker/stacks/n8n/n8n.yml restart n8n     # restart
```

---

## Quick Checklist

1. LM Studio running with both models loaded? (`qwen3.5-9b` + `qwen2.5-coder-32b-instruct`)
2. Can you reach LM Studio? `curl http://10.0.0.100:1234/v1/models`
3. `workflows/.env` populated with all variables?
4. n8n env vars include `LLM_API_KEY`, `LM_STUDIO_URL`, model names, `FILE_API_URL`, `FILE_API_TOKEN`, `MCP_GATEWAY_URL`?
5. All 8 workflows activated in n8n? (00–07)
6. `WF_*` IDs in `workflows/.env` match your n8n instance?
7. File-api container running? `docker ps | grep file-api`
8. Webhook URL includes workflow ID prefix?
