# Troubleshooting Guide — eek-Go v2

## LM Studio Connection

### "Failed to connect to LM Studio"

```bash
curl http://10.0.0.100:1234/v1/models
```

1. Open LM Studio → verify server is running on port 1234
2. Check firewall allows port 1234 inbound
3. If the IP changed, update `LM_STUDIO_HOST` and `LM_STUDIO_URL` in `workflows/.env`

### 401 Unauthorized

All pipeline nodes send `Authorization: Bearer $env.LLM_API_KEY`. Set `LLM_API_KEY` in `workflows/.env` to match LM Studio's API key.

### Model won't load / VRAM errors

The pipeline loads/unloads models between phases (only one at a time). If a previous run crashed, a model may still be loaded. The `Startup: Unload All Models` node clears this automatically, but you can also:

```bash
# List loaded models
curl http://10.0.0.100:1234/api/v1/models -H "Authorization: Bearer <key>"

# Unload by instance ID
curl -X POST http://10.0.0.100:1234/api/v1/models/unload \
  -H "Content-Type: application/json" \
  -d '{"instance_id": "<id>"}'
```

### Planner timeout (300s+)

Qwen3.5-27B is a reasoning model — it generates `<think>` tokens before responding. With `max_tokens: 32768`, generation can take 10+ minutes. The planner HTTP timeout is 600s. Monitor with:

```bash
lms log stream
```

### Empty / blank responses

Qwen3.5 reasoning models put output in `reasoning_content`, not `content`. All parse nodes handle this by checking both fields and stripping `<think>` blocks.

---

## n8n Workflow

### Webhook 404

The webhook URL is simply `/webhook/coding-agent` (no workflow ID prefix needed for the current setup).

### Infinite loop in Phase 2

**NEVER use n8n IF nodes for loop control.** IF nodes cache their condition from the first iteration and reuse it for all subsequent iterations. The current design uses Code node "gates" instead:

```
P2: Store Result → P2: Continue Gate → P2: Stash Context (loop back)
                 ↘ P2: Exit Gate → Unload Coder Model (exits)
```

Each gate is a Code node that returns `[]` (empty array) to kill its branch when not applicable.

### n8n expression caching in loops

`$('NodeName').first().json` always returns the FIRST iteration's data in loops. Use `$json` (direct input) or `$getWorkflowStaticData('global')` instead.

### P3: Needs Fix? always triggers fix phase

Boolean conditions in IF nodes with `typeValidation: "loose"` convert `false` to string `"false"` (truthy). Use `number.gt(0)` with `strict` validation instead.

### Status callbacks not reaching Forge

Callback nodes POST to `http://forge:3500/api/status-callback`. Verify:
1. Forge container is running: `docker ps | grep forge`
2. Forge is on `shared_net`: `docker inspect forge --format '{{range $net, $_ := .NetworkSettings.Networks}}{{$net}} {{end}}'`
3. All callback nodes have `onError: "continueRegularOutput"` — pipeline never stops if Forge is down

---

## eek-Forge

### "fetch failed" error in chat

Normal behavior. The n8n webhook holds the HTTP connection open until the pipeline finishes (~5-10 min). Forge's fetch has a 10s AbortController timeout — the abort is silently ignored since all status comes via SSE callbacks. If you see this error, it's from before the timeout fix was deployed.

### "Pipeline running" disappears when switching projects

Fixed: the chat context now checks the last status message when loading a project. If the last event isn't `pipeline_complete` or `pipeline_error`, it restores the running state.

### `[object Object]` in task status

The file-api returns `files_written` as `[{path, bytes, success}]` objects. The `P2: Store Result` node extracts `.path` from each. If you see `[object Object]`, the extraction isn't working — check the `writtenFiles` line in that node.

### Projects from disk showing in sidebar

Only SQLite-created projects show in the sidebar. The old behavior merged file-api disk listing (which included `.claude`, `eek-dash`, etc.). This was removed.

### SSE not reconnecting

`EventSource` auto-reconnects. On reconnect, refresh the page to reload messages from SQLite (messages received while disconnected are persisted server-side).

---

## File API

### 401 Unauthorized

`FILE_API_TOKEN` in `workflows/.env` must match what pipeline nodes send.

### Files not on disk

```bash
docker ps | grep file-api
curl -H "Authorization: Bearer <token>" http://localhost:3456/health
```

Files are written to the Docker volume mapped to `/home/will/src/` on the host.

### Scrape endpoint failing

The `/scrape` endpoint uses Playwright + Chromium. If it fails:
1. Check the target URL is accessible from the Docker network
2. `onError: continueRegularOutput` on `P0: Scrape URL` means scrape failures don't kill the pipeline
3. The scrape has a 30s timeout

---

## Quick Checklist

1. LM Studio running at `http://10.0.0.100:1234`?
2. `workflows/.env` populated with all variables?
3. n8n running? `docker ps | grep n8n`
4. File-api running? `docker ps | grep file-api`
5. Forge running? `docker ps | grep forge`
6. All on `shared_net`? `docker network inspect shared_net | jq '.[0].Containers | keys'`
7. Workflow activated in n8n? Check `http://localhost:5678`
8. Models available in LM Studio? `qwen3.5-27b@q4_k_m` + `qwen/qwen3-30b-a3b-2507`
