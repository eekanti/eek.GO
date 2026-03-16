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

- **Planner / Security / Quality reviewers:** Open the failing workflow, find the **Call LM Studio** HTTP Request node, and verify `Authorization: Bearer <your LM_STUDIO_API_KEY>`
- **Code Writer:** Check the `LM Studio Chat Model` node credential in `02-Code-Writer-Agent`

The key is stored as `LM_STUDIO_API_KEY` in `/docker/mcp/.env`.

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

## Code Writer / Redis Session Memory

### Code Writer not recalling previous pass (P2/P3)

The Code Writer uses Redis Chat Memory with session key `{project_id}-{task_id}` and a 1-hour TTL. If P2/P3 sends feedback but the agent doesn't remember its prior code:

```bash
# Verify Redis is running and accessible to n8n
docker ps | grep redis
```

Check the **Redis Chat Memory** node's credential in `02-Code-Writer-Agent` points to your Redis instance.

### Session key collisions

Each task generates a unique session key: `{project_id}-{task_id}`. If you reuse the same `project_id` and the same task IDs across runs within the TTL window (1 hour), the agent may pick up stale conversation history. To force a clean run, either use a new `project_id` or wait for the TTL to expire.

---

## Task Processor / Quality Gate

### Tasks stuck retrying

The quality gate passes when `security_score ≥ 8` AND `critical_issues.length === 0`. If your model consistently scores below 8, lower the threshold in the **Quality Gate 1** and **Quality Gate 2** Code nodes in `07-Task-Processor`:
```javascript
quality_score >= 8 && critical_issues.length === 0
// Change to, e.g.:
quality_score >= 6 && critical_issues.length === 0
```

After 3 passes (P1 → P2 → P3) the processor writes files regardless.

### Review nodes returning unparseable output

If both Security and Quality reviewers return `raw_output` (parse failure), the Task Processor accepts the code as-is rather than looping. Check LM Studio is returning valid JSON in reviewer responses.

---

## File API

### 401 from File API

The Bearer token in the **Write Files to Disk** HTTP node in `07-Task-Processor` must match `FILE_API_TOKEN` in `/docker/stacks/file-api/.env`. Both should use the same value from `/docker/mcp/.env`.

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

1. Is LM Studio server started and a model loaded?
2. Can you `curl http://10.0.0.100:1234/v1/models` from the server?
3. Is Redis running and accessible to n8n?
4. Are all 8 workflows activated in n8n?
5. Is the file-api container running?
6. Does the webhook URL include the workflow ID prefix?
7. Does `LOCAL_AI_MODEL` env var match your loaded model's identifier?
