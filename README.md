# eek-Go — Multi-Agent Coding Pipeline

A local AI coding pipeline powered by **n8n**, **LM Studio**, and **eek-Forge**. Describe what you want to build, paste a reference screenshot or URL, and the pipeline plans, researches, codes, reviews, fixes, and writes files to disk automatically.

## Architecture

```
User → eek-Forge (chat UI) → n8n Webhook
                                   │
                            ┌──────┴──────┐
                            │  eek-Go v2  │  (single unified workflow)
                            └──────┬──────┘
                                   │
  Phase 0: Scrape ─── Phase 1: Plan ─── Research ─── Phase 2: Code
  (optional URL)       (Qwen3.5-27B)    (Context7)   (Qwen3-30B-A3B)
  Screenshot + CSS     Break into 2-3    Fetch lib    Full project context
  DOM → planner        large tasks       docs for     + lib docs → coder
                                         project deps Up to 15 files/chunk
                            │
  Phase 3: Review ─── Phase 4: Fix ─── Phase 5: Final Review
  (Qwen3.5-27B)       (Qwen3-30B-A3B)  (Qwen3.5-27B)
  Cross-file audit     Fix critical      Re-review fixed code
  Import/export        issues            Quality score +
  mismatches                             actionable suggestions
                            │
                            ▼
                   Status callbacks → eek-Forge (SSE)
                   Files written → /home/will/src/{project_id}/
```

### Model Lifecycle

Only one model is loaded at a time (VRAM constraint). The pipeline automatically loads/unloads between phases:

```
Startup: Unload All Models
→ Load Planner (96K ctx) → Plan → Unload Planner
→ Research: Fetch Docs (no model needed — Context7 MCP HTTP calls)
→ Load Coder (128K ctx) → Code Loop → Unload Coder
→ Load Reviewer (64K ctx) → Review → Unload Reviewer
→ [If fixes needed] Load Fixer (128K ctx) → Fix → Unload Fixer
→ Load Final Reviewer (64K ctx) → Final Review → Unload → Done
```

### Coder Context Strategy

The coder receives **128K context** per call and currently uses ~10-20%. Each call includes:

- **Full project files** — every file in the project (not just the chunk), so the coder sees all CSS classes, imports, exports, and component props
- **Library docs** — Context7 MCP docs for the project's dependencies (React, Vite, Tailwind, etc.)
- **Task description** — detailed instructions from the planner
- **Architecture plan** — the full plan document for cross-task awareness

This prevents common issues like missing CSS styles, broken imports, and incorrect API usage.

## Services

| Service | Port | Purpose |
|---------|------|---------|
| **n8n** | 5678 | Workflow engine — runs the eek-Go pipeline |
| **LM Studio** | 1234 | Local LLM server (10.0.0.100) |
| **file-api** | 3456 | File CRUD + Playwright scraping for generated code |
| **eek-Forge** | 3500 | Chat UI — create projects, send prompts, view progress |
| **docky** | 8811 | Context7 MCP gateway for library documentation |

All services on the `shared_net` Docker bridge network.

## Setup

### 1. Configure environment

```bash
cp .env.example workflows/.env
# Edit workflows/.env — set your API keys and model names
```

### 2. Deploy

```bash
./deploy.sh
```

Builds file-api + Forge containers, restarts n8n, imports the workflow.

### 3. Models

Load these in LM Studio (one at a time — the pipeline handles swapping):

| Model | Role | Context |
|-------|------|---------|
| `qwen3.5-27b@q4_k_m` | Planner, Reviewer, Final Reviewer | 96K / 64K |
| `qwen/qwen3-30b-a3b-2507` | Coder, Fixer | 128K |

## Environment Variables

All in `workflows/.env`:

| Variable | Purpose |
|----------|---------|
| `LLM_API_KEY` | Bearer token for LM Studio |
| `LM_STUDIO_URL` | Chat completions endpoint |
| `LM_STUDIO_HOST` | LM Studio base URL (for model load/unload API) |
| `PLANNER_MODEL` | Model key for planner/reviewer (`qwen3.5-27b@q4_k_m`) |
| `CODER_MODEL` | Model key for coder/fixer (`qwen/qwen3-30b-a3b-2507`) |
| `FILE_API_URL` | File API URL (`http://file-api:3456`) |
| `FILE_API_TOKEN` | Bearer token for File API |
| `MCP_GATEWAY_URL` | Context7 MCP endpoint (`http://docky:8811/mcp`) |
| `N8N_API_KEY` | n8n API key for workflow deployment |

## Usage

### Via eek-Forge (recommended)

Open **http://localhost:3500** or your proxy URL.

1. Click **+ New project** and name it
2. Type a prompt describing what to build
3. Optionally paste an image (Ctrl+V) or URL as a design reference
4. Watch status updates stream in real-time as the pipeline runs:
   - ⚡ Starting pipeline...
   - 🗂️ Planned 3 tasks
   - 📚 Fetched docs for react, vite, tailwindcss
   - ✍️ Wrote TASK-001: src/App.jsx, src/index.css
   - ✅ Review complete — quality: 85/100
   - 🔧 Applied 1 fix: src/App.jsx
   - 📋 Final review: 92/100
   - 🎉 Pipeline finished! 3 tasks, 12 files
5. Review the final quality score and **suggested next steps**
6. Click a suggestion to expand the full engineering brief, then **"Use as next prompt"** to iterate

### Via curl

```bash
curl -X POST http://localhost:5678/webhook/coding-agent \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Build a landing page with hero, features grid, and contact form",
    "project_id": "my-project",
    "reference_url": "https://example.com"
  }'
```

### Webhook Parameters

| Field | Required | Description |
|-------|----------|-------------|
| `message` | Yes | Natural language coding request |
| `project_id` | No | Folder name (auto-generated if omitted) |
| `reference_url` | No | URL to scrape for visual reference |
| `image_data` | No | Base64 PNG image for visual reference |

### Output

Files are written to `/home/will/src/{project_id}/` via file-api.

## File Structure

```
n8n-team/
├── file-api/                     File CRUD + Playwright scraping service
│   ├── app.js                      Express server (projects, files, scrape)
│   ├── Dockerfile                  Node 20 + Chromium
│   ├── docker-compose.yml
│   └── package.json
├── forge/                        eek-Forge chat UI
│   ├── server.js                   Express backend (chat, SSE, status callbacks, SQLite)
│   ├── db.js                       SQLite schema and helpers
│   ├── src/                        React frontend (Vite + HeroUI + Tailwind)
│   │   ├── App.jsx                   Chat layout with project management
│   │   ├── context/ChatContext.jsx    State management (useReducer)
│   │   ├── hooks/useSSE.js           Server-Sent Events for live updates
│   │   └── components/               Sidebar, ChatView, ChatInput, messages
│   ├── Dockerfile                  Multi-stage build (+ better-sqlite3 native)
│   ├── docker-compose.yml          + SQLite volume (forge-data)
│   └── package.json
├── workflows/
│   ├── .env                      Pipeline configuration (single source of truth)
│   └── eek-go.json               Unified workflow (deployed to n8n)
├── docs/
│   ├── n8n.md                    n8n expression & node reference
│   └── Troubleshooting Guide.md
├── .env.example                  Template for workflows/.env
├── deploy.sh                     Automated deployment
└── README.md
```

## Pipeline Phases (eek-Go v2)

| Phase | What happens |
|-------|-------------|
| **P0: Scrape** | If `reference_url` provided, Playwright screenshots the page + extracts CSS tokens and DOM structure. Screenshot sent to planner as multimodal image. |
| **P1: Plan** | Qwen3.5-27B breaks the request into 2-3 large tasks (up to 12-15 files each). Topological sort on dependencies. First task includes project config (package.json, vite.config.js, etc.) for new projects. |
| **Research** | Fetches library docs from Context7 MCP based on project dependencies (package.json) and planner output. Top 5 priority libraries (react, vite, tailwindcss, etc.) get up-to-date API docs fed to the coder. |
| **P2: Code** | Qwen3-30B-A3B (128K context) writes files per task. Each coder call receives the **full project files** + **library docs** for complete cross-file awareness. Up to 15 files per chunk. Loop controlled by Code node gates (not IF nodes — they cache in n8n loops). |
| **P3: Review** | Qwen3.5-27B performs cross-file review: import/export mismatches, missing CSS classes, broken deps, type errors. |
| **P4: Fix** | If critical/high issues found, Qwen3-30B-A3B generates targeted fixes. |
| **P5: Final Review** | Second review pass on the fixed code. Produces quality score + 2-3 actionable suggestions with preview/detail format for the next iteration. |

### LLM Temperature Settings

| Role | Temperature | top_p | Rationale |
|------|-------------|-------|-----------|
| Planner | 0.7 | 0.95 | Creative task decomposition |
| Coder | 0.1 | 0.3 | Precise, deterministic code |
| Reviewer | 0.3 | 0.6 | Balanced analysis |
| Fixer | 0.3 | 0.4 | Precise fixes |

### Key Design Decisions

- **Code node gates instead of IF nodes** for loop control — n8n IF nodes cache their condition from the first iteration, causing infinite loops
- **Full project context** on every coder call — prevents CSS/import mismatches across files (coder uses ~10-20% of 128K, plenty of headroom)
- **One model at a time** — VRAM constraint means planner/coder/reviewer can't coexist. Pipeline auto-swaps via LM Studio load/unload API
- **Fire-and-forget webhook** — Forge sends the request and immediately starts listening for SSE callbacks. No long-polling or blocking.
- **Qwen3.5 reasoning model** — generates `<think>` tokens before responding. All parse nodes strip thinking content. `max_tokens` must account for thinking budget.

## Troubleshooting

See [docs/Troubleshooting Guide.md](docs/Troubleshooting%20Guide.md) for detailed solutions.

| Problem | Fix |
|---------|-----|
| Webhook 404 | URL is just `/webhook/coding-agent` (no workflow ID prefix) |
| LM Studio 401 | Set `LLM_API_KEY` in `workflows/.env` to match LM Studio |
| Planner timeout | Qwen3.5 reasoning model can be slow. Timeout is 600s. Check `lms log stream` |
| Infinite loop in P2 | Never use IF nodes for loop control in n8n — they cache. Use Code node gates |
| Models won't load | Startup node unloads all models. Check VRAM — only one model at a time |
| `[object Object]` in status | File paths not extracted — check P2: Store Result `writtenFiles` mapping |
| Pipeline finishes but no callbacks | Verify Forge container is on `shared_net` and reachable as `http://forge:3500` |
| "fetch failed" in Forge | Normal — webhook holds connection open. Forge uses AbortController (10s timeout) |
| Research fetches 0 docs | Check `docker ps \| grep docky` and that Context7 MCP is reachable at `http://docky:8811/mcp` |
| Missing package.json on new projects | Planner must include config files. Check Planner: Build Request prompt rules |
| Files not on disk | Check `docker ps \| grep file-api` and hit `/health` |
