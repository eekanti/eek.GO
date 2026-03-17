# Troubleshooting Guide

## LM Studio Connection

### "Failed to connect to http://10.0.0.100:1234"

```bash
# Test connectivity
curl -v http://10.0.0.100:1234/v1/models
```

1. Open LM Studio → **Server** tab → select model → **Start Server**
2. Check firewall on the LM Studio machine allows port 1234 inbound
3. If the IP changed: update the `url` field in each workflow's HTTP Request node (and the `LM Studio Chat Model` node in `02-Code-Writer-Agent`)

### 401 Unauthorized from LM Studio

All agents (including Code Writer) use HTTP Request nodes with `Authorization: Bearer $env.LLM_API_KEY`.

Set `LLM_API_KEY` in your n8n environment variables to match the API key configured in LM Studio → Server → API Key.

### Empty responses / blank content from model

The Qwen3 thinking model puts its output in `reasoning_content`, leaving `content` empty. Fixes already in place:
- All prompts end with `/nothink` to suppress chain-of-thought
- All parse-response Code nodes strip `<think>...</think>` blocks and fall back to `msg.reasoning_content`

If you see empty output, check that the parse-response node in the failing workflow has:
```javascript
let content = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
const content = (msg.content && msg.content.trim()) ? msg.content : (msg.reasoning_content || '');
```

If responses are truncated, increase `max_tokens` in the Build Request node (or the LM Studio Chat Model options for Code Writer).

---

## Webhook 404

n8n 2.10+ prepends the workflow ID to the webhook path. The URL format is:
```
/webhook/{workflowId}/webhook/{path}
```

Find the correct URL by opening the Master Orchestrator in n8n → click the **Webhook** node → copy the **Production URL** shown there.

---

## Sub-workflow Errors

### "Workflow not found" / Execute Workflow fails

- Confirm the sub-workflow is **activated** (toggle in n8n)
- Confirm the workflow ID in the Execute Workflow node matches the actual ID in your n8n instance (visible in the URL when editing the workflow)

### executeWorkflow passes wrong data

All sub-workflows use `typeVersion: 1.1` with this format:
```json
{ "__rl": true, "value": "WORKFLOW_ID", "mode": "id" }
```
If you see a version mismatch error, check the `typeVersion` field on the Execute Workflow node.

---

## Code Writer

### Code Writer not reflecting previous feedback (P2/P3)

The Code Writer uses direct HTTP (no Redis or session memory). On P2/P3 passes, the full task context and `previous_feedback` string are re-sent in the same request. If feedback isn't being applied:

1. Open the failing execution in n8n
2. Check the **Prepare Message** node output — confirm `previous_feedback` is populated and non-empty
3. Check the **Call LM Studio** node response — confirm the model acknowledged the feedback

### Model only outputs partial files

The Code Writer sends a `FILES TO MODIFY` constraint from `task.files`. If the Planner didn't include a `files` array in the task, no constraint is sent and the model may produce extra files. Re-run the planner or manually add a `files` array to the task input.

---

## Task Processor / Quality Gate

### Tasks stuck retrying

The quality gate passes when `(job_complete === true OR quality_score >= 80) AND critical_issues.length === 0`.

The gate primarily relies on the Quality Reviewer's `job_complete` flag. If your model never returns `job_complete: true`, change the condition in **Quality Gate 1** and **Quality Gate 2** Code nodes in `07-Task-Processor`:

```javascript
shouldStop = (jobComplete || score >= 80) && criticalCount === 0;
// Change to, e.g., score-only gate on a 0–10 scale:
shouldStop = score >= 7 && criticalCount === 0;
```

After 3 passes (P1 → P2 → P3) the processor writes files regardless.

### Review nodes returning unparseable output

If both Security and Quality reviewers return `raw_output` (parse failure), the Task Processor accepts the code as-is rather than looping. Check LM Studio is returning valid JSON in reviewer responses.

---

## File API

### 401 from File API

The Bearer token in the **Write Files to Disk** HTTP node in `07-Task-Processor` must match `FILE_API_TOKEN` in `/docker/stacks/file-api/.env`.

When a write fails, the Task Processor automatically calls the Error Logger (05), which writes the error to `system-logs/_logs/errors/` via the File API.

### Files not appearing on disk

```bash
docker ps | grep file-api
curl -H "Authorization: Bearer <token>" http://localhost:3456/health
```

Files land at `/home/will/src/{project_id}/`. The File API runs as the `node` Docker user — use `sudo` or the File API's DELETE endpoint to remove them from the host.

### Path traversal blocked (unexpected 500)

The File API rejects paths that escape the project root. Ensure `path` values in the Code Writer's `[{path, content}]` output are relative (e.g., `src/index.ts`, not `/etc/passwd` or `../../etc/passwd`).

---

## Project Memory

### Memory not persisting across n8n restarts

`getWorkflowStaticData('global')` persists as long as the **06-Project-Memory** workflow is not re-imported or deleted. Re-importing resets its static data. If you need to re-import, export the `staticData` column from the n8n SQLite DB first.

### Wrong goal loaded for project

Each project is keyed by `project_id`. If you omit `project_id` in the webhook payload, a new one is generated (`proj-{timestamp}`). Always pass the same `project_id` to continue an existing project.

---

## n8n Container

```bash
# View logs
docker compose logs -f n8n

# Restart
docker compose restart n8n

# Check disk space / memory
df -h /
free -m
```

If n8n keeps restarting, check for OOM errors in the logs and add a memory limit to the n8n service in its compose file if needed.

---

## Quick Checklist

1. Is LM Studio server started with **both** models loaded (`qwen3.5-9b` and `qwen2.5-coder-32b-instruct`)?
2. Can you `curl http://10.0.0.100:1234/v1/models` from the server?
3. Is `LLM_API_KEY` set in n8n's environment variables?
4. Are all 8 workflows activated in n8n?
5. Is the file-api container running?
6. Does the webhook URL include the workflow ID prefix?
7. Do the workflow IDs in Execute Workflow nodes match your n8n instance?
