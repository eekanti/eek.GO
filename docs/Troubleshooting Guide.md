# Troubleshooting Guide — eek.GO v3

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

## Research Agent (Context7 MCP)

### Research fetches 0 docs

The Research node connects to the Context7 MCP gateway at `http://docky:8811/mcp`. Check:

```bash
docker ps | grep docky
# Test MCP connectivity
curl -X POST http://localhost:8811/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}'
```

### Wrong libraries fetched

The Research node extracts deps from:
1. `package.json` (if the project already has one)
2. Planner task descriptions (scans for framework keywords)

Priority libraries (fetched first): `react`, `next`, `vite`, `tailwindcss`, `express`, `prisma`, `framer-motion`, `@heroui/react`. Max 5 per run.

### Research docs not reaching the coder

Research docs are stored in `$getWorkflowStaticData('global')._researchDocs`. The `CW: Prepare Message` node includes them in the coder's system prompt under "PROJECT CONTEXT (from research agent)". Check that `_researchDocs` is populated after the Research node runs.

### MCP session errors

The MCP gateway uses Streamable HTTP with session IDs. The Research node initializes a fresh session per run. If the gateway restarts mid-session, the node gracefully falls back to no docs (pipeline continues).

---

## Coder Context

### Missing CSS styles / broken imports across files

The coder now receives ALL project files as context on every call (not just its chunk files). If styles are still missing:
1. Check `P2: Build Code Input` — it should set `existingFiles = allFiles` (all files, not filtered)
2. Check `CW: Prepare Message` — the header should say "FULL PROJECT CONTEXT"
3. Verify the coder's prompt token count is >5,000 (check execution data for `CW: Call LM Studio` usage)

### Coder only using 2% context

With full project files + library docs, expect 10-30% context usage. If still very low:
- The project may have very few files (normal for early iterations)
- Library docs may not be fetching (check Research node)
- The `_allFileContents` cache may be empty (check `Prepare Planner Input`)

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

## v3 Multi-Model Issues

### Wrong model loading

After changing model keys in `workflows/.env`, you must recreate the n8n container (not just restart):
```bash
docker stop n8n && docker rm n8n && docker compose up -d
```
Verify: `docker exec n8n env | grep MODEL`

### Model fails to load (VRAM)

The VL-32B planner at 96K context may exceed 32GB VRAM via API (UI settings like KV cache quantization don't carry over to API loads). Reduce context to 32K in the workflow, or configure the model in LM Studio UI first with Flash Attention + KV Cache Q8_0 + "Remember settings."

### Pre-planning agent loads wrong model

Forge's agent uses `AGENT_MODEL` env var. If it loads the planner model instead, rebuild Forge: `cd forge && docker compose up -d --build`

### Build & Preview shows old project

The preview process cleanup now kills entire process groups (`kill -pid`). If still stuck, restart file-api: `cd file-api && docker compose restart`

### Stats panel empty

Stats fetch from n8n execution API. Need at least one successful execution for the selected project. Check that `N8N_API_KEY` is set in Forge's env.

---

## Quick Checklist

1. LM Studio running at `http://10.0.0.100:1234`?
2. `workflows/.env` populated with all 9 model/service variables?
3. n8n running with NEW env? `docker exec n8n env | grep PLANNER_MODEL`
4. File-api running? `docker ps | grep file-api`
5. Forge running? `docker ps | grep forge`
6. Docky (MCP gateway) running? `docker ps | grep docky`
7. All on `shared_net`? `docker network inspect shared_net | jq '.[0].Containers | keys'`
8. Workflow activated in n8n? Check `http://localhost:5678`
9. All 6 models downloaded in LM Studio?
   - `qwen/qwen3.5-9b`
   - `qwen/qwen3-vl-32b`
   - `qwen/qwen3-coder-next`
   - `deepseek-r1-distill-qwen-14b`
   - `mistralai/devstral-small-2-2512`
   - `mistralai/magistral-small-2509`
