# eek-Go v3 — Multi-Agent Coding Pipeline

A local AI coding pipeline powered by **n8n**, **LM Studio**, and **eek-Forge**. Describe what you want to build, paste a reference screenshot or URL, and the pipeline plans, researches, codes, reviews, fixes, and writes files to disk automatically.

**v3** uses 6 specialized models across 4 model families, with a pre-planning conversation agent, Context7 + Magic UI research, and a full-featured chat UI with live preview and execution stats.

## Architecture

```
User → eek-Forge (chat UI)
         │
         ├─ Pre-planning Agent (Qwen3.5-9B)
         │    "Do you need dark mode?" → user answers → enriched prompt
         │
         ▼
       n8n Webhook → eek-Go v3 Pipeline
         │
         ├─ Phase 0: Scrape (optional reference URL → Playwright screenshot)
         │
         ├─ Phase 1: Plan (Qwen3-VL-32B — vision model sees reference images)
         │    Break request into 2-3 large tasks, 12-15 files each
         │
         ├─ Research: Fetch Docs (Context7 MCP + Magic UI MCP + Design Guide)
         │    Library API docs + UI component examples + design principles
         │
         ├─ Phase 2: Code (Qwen3-Coder-Next 80B MoE)
         │    Full project context + research docs → coder writes files
         │
         ├─ Phase 3: Review (DeepSeek-R1-14B)
         │    Cross-file audit: imports, CSS chain, build chain, dead files
         │
         ├─ Phase 4: Fix (Devstral-2 24B)
         │    Targeted fixes from a different model family
         │
         ├─ Phase 5: Final Review (Magistral 24B)
         │    Second opinion + actionable suggestions for next iteration
         │
         └─ Status callbacks → eek-Forge (SSE)
              Files written → /home/will/src/{project_id}/
```

### Model Lineup (v3)

6 specialized models, 4 model families — each optimized for its role:

| Role | Model | Params | Temp | top_p | Context | Why |
|------|-------|--------|------|-------|---------|-----|
| Pre-planning Agent | Qwen3.5-9B | 9B dense | 0.6 | 0.85 | 32K | Fast conversational Q&A |
| Planner | Qwen3-VL-32B | 32B dense | 0.7 | 0.9 | 96K | Dedicated vision model for reference images |
| Coder | Qwen3-Coder-Next | 80B MoE (3B active) | 0.05 | 0.2 | 64K | Code-specialized, near-deterministic |
| Reviewer | DeepSeek-R1-14B | 14B dense | 0.3 | 0.6 | 64K | Chain-of-thought reasoning, different family |
| Fixer | Devstral-2 24B | 24B dense | 0.1 | 0.25 | 96K | Agentic code editing, multi-file surgery |
| Final Reviewer | Magistral 24B | 24B dense | 0.5 | 0.75 | 96K | Reasoning model, creative suggestions |

Only one model loaded at a time (32GB VRAM). Pipeline auto-swaps via LM Studio load/unload API.

### Coder Context Strategy

Each coder call receives:

- **Design guide** — universal UI/UX principles (layout, feedback, color, animation) (~500 tokens)
- **Library docs** from Context7 — React, Tailwind, Zustand, etc. (~2K tokens per lib)
- **UI component examples** from Magic UI (21st.dev) — real production component code (~3-8K tokens)
- **Full project files** — every file in the project for cross-file awareness
- **Task description** — detailed instructions from the planner

Typical context usage: 13-22% of 64K, scaling up as the project grows.

## Services

| Service | Port | Purpose |
|---------|------|---------|
| **n8n** | 5678 | Workflow engine — runs the eek-Go pipeline |
| **LM Studio** | 1234 | Local LLM server (10.0.0.100) — hosts all 6 models |
| **file-api** | 3456 | File CRUD + Playwright scraping + Build & Preview |
| **eek-Forge** | 3500 | Chat UI — projects, conversations, live preview, stats |
| **docky** | 8811 | MCP gateway — Context7 + Magic UI + GitHub + more |

All services on the `shared_net` Docker bridge network.

## eek-Forge Features

- **Chat-based interface** — send prompts, paste images, paste URLs
- **Pre-planning conversation** — AI agent asks clarifying questions before building
- **Real-time status** via SSE — watch each pipeline phase as it happens
- **Build & Preview** — one-click npm install + dev server with live iframe
- **Suggestions** — expandable engineering briefs, click to use as next prompt
- **Pipeline stats panel** — token usage per phase, quality scores, research context
- **Project management** — create, rename, delete, search projects
- **Dark mode** — persistent preference, HeroUI themed
- **SQLite persistence** — chat history, projects survive container restarts

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

Download these in LM Studio (pipeline handles loading/unloading):

| Model | Role |
|-------|------|
| `qwen/qwen3.5-9b` | Pre-planning agent |
| `qwen/qwen3-vl-32b` | Planner (vision) |
| `qwen/qwen3-coder-next` | Coder |
| `deepseek-r1-distill-qwen-14b` | Reviewer |
| `mistralai/devstral-small-2-2512` | Fixer |
| `mistralai/magistral-small-2509` | Final reviewer |

For each model, configure in LM Studio UI: Flash Attention ON, KV Cache Quantization Q8_0, Max Concurrent Predictions 1. Check "Remember settings."

## Environment Variables

All in `workflows/.env`:

| Variable | Purpose |
|----------|---------|
| `LLM_API_KEY` | Bearer token for LM Studio |
| `LM_STUDIO_URL` | Chat completions endpoint |
| `LM_STUDIO_HOST` | LM Studio base URL (for model load/unload API) |
| `PLANNER_MODEL` | `qwen/qwen3-vl-32b` |
| `CODER_MODEL` | `qwen/qwen3-coder-next` |
| `REVIEWER_MODEL` | `deepseek-r1-distill-qwen-14b` |
| `FIXER_MODEL` | `mistralai/devstral-small-2-2512` |
| `FINAL_REVIEWER_MODEL` | `mistralai/magistral-small-2509` |
| `AGENT_MODEL` | `qwen/qwen3.5-9b` |
| `FILE_API_URL` | File API URL (`http://file-api:3456`) |
| `FILE_API_TOKEN` | Bearer token for File API |
| `MCP_GATEWAY_URL` | MCP endpoint (`http://docky:8811/mcp`) |
| `N8N_API_KEY` | n8n API key for workflow deployment |

## Usage

### Via eek-Forge (recommended)

Open **http://localhost:3500** or your proxy URL.

1. Click **+ New project** and name it
2. Type a prompt describing what to build
3. The AI agent may ask 1-2 clarifying questions — answer them
4. Watch status updates stream in real-time:
   - 🚀 All questions answered — starting pipeline...
   - ⚡ Starting pipeline...
   - 🗂️ Planned 3 tasks
   - 📚 Fetched docs for react, tailwindcss, zustand (5 docs)
   - ✍️ Wrote TASK-001: package.json, src/App.tsx, src/index.css...
   - ✅ Review complete — quality: 85/100
   - 🔧 Applied 2 fixes
   - 📋 Final review: 92/100
   - 🎉 Pipeline finished!
5. Click **Build & Preview** to see the live app in an iframe
6. Click the **📊 stats icon** to see token usage and model performance
7. Click a suggestion to use it as your next prompt — iterate!

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

## File Structure

```
n8n-team/
├── file-api/                     File CRUD + Playwright scraping + Build & Preview
│   ├── app.js                      Express server (projects, files, scrape, preview)
│   ├── Dockerfile                  Node 20 + Chromium
│   ├── docker-compose.yml          Exposes port 4000 for previews
│   └── package.json
├── forge/                        eek-Forge chat UI
│   ├── server.js                   Express backend (chat, SSE, pre-planning agent, stats, SQLite)
│   ├── db.js                       SQLite schema and helpers
│   ├── src/                        React frontend (Vite + HeroUI + Tailwind)
│   │   ├── App.jsx                   Layout with dark mode + stats panel
│   │   ├── context/ChatContext.jsx    State management (useReducer)
│   │   ├── hooks/useSSE.js           Server-Sent Events for live updates
│   │   └── components/
│   │       ├── Sidebar.jsx            Projects, search, dark mode toggle
│   │       ├── ChatView.jsx           Chat area with stats toggle
│   │       ├── ChatInput.jsx          Text + image paste + URL detection
│   │       ├── StatsPanel.jsx         Token usage, quality, execution info
│   │       └── messages/              User, Status, Result, PlanApproval, Error
│   ├── public/favicon.svg          Forge hammer icon
│   ├── Dockerfile                  Multi-stage build (+ better-sqlite3 native)
│   ├── docker-compose.yml          + SQLite volume (forge-data)
│   └── package.json
├── workflows/
│   ├── .env                      Pipeline configuration (6 model keys + services)
│   └── eek-go.json               Unified workflow (deployed to n8n)
├── docs/
│   ├── n8n.md                    n8n expression & node reference
│   └── Troubleshooting Guide.md
├── .env.example                  Template for workflows/.env
├── deploy.sh                     Automated deployment
└── README.md
```

## Pipeline Phases (eek-Go v3)

| Phase | Model | What happens |
|-------|-------|-------------|
| **Pre-planning** | Qwen3.5-9B | Forge asks clarifying questions before pipeline starts. Skips if prompt is detailed enough. |
| **P0: Scrape** | — | If `reference_url` provided, Playwright screenshots + extracts CSS tokens and DOM. |
| **P1: Plan** | Qwen3-VL-32B | Vision model sees reference images. Breaks request into 2-3 large tasks. First task includes all config files. |
| **Research** | — | Context7 MCP fetches library docs for project deps. Magic UI fetches component examples. Design guide injected. |
| **P2: Code** | Qwen3-Coder-Next | Code-specialized 80B MoE. Receives full project files + all research docs. Near-deterministic (temp 0.05). |
| **P3: Review** | DeepSeek-R1-14B | Chain-of-thought reasoning. Checks CSS chain, build chain, dead files, import mismatches. Different model family. |
| **P4: Fix** | Devstral-2 24B | Agentic code editing from Mistral. Surgical precision (temp 0.1). |
| **P5: Final Review** | Magistral 24B | Reasoning model. Higher temp (0.5) for creative suggestions. Produces 2-3 actionable engineering briefs. |

### Key Design Decisions

- **6 models, 4 families** — Qwen, DeepSeek, Mistral (Devstral + Magistral). Model diversity means each stage has different blind spots.
- **Code node gates** for loop control — n8n IF nodes cache conditions in loops, so we use Code nodes that return `[]` to kill branches.
- **Full project context** on every coder call — prevents CSS/import mismatches across files.
- **Dynamic research** — reads package.json deps, fetches docs for whatever the project uses. No hardcoded library list.
- **Fire-and-forget webhook** — Forge sends request and listens for SSE callbacks. No blocking.
- **Pre-planning agent in Forge** — conversation happens in Forge backend (calls LM Studio directly), not in n8n. Avoids n8n Wait node issues.

## Troubleshooting

See [docs/Troubleshooting Guide.md](docs/Troubleshooting%20Guide.md) for detailed solutions.

| Problem | Fix |
|---------|-----|
| Model won't load | Check VRAM. Set KV Cache Quantization in LM Studio UI. Max 1 concurrent prediction. |
| Planner timeout | VL-32B reasoning can be slow. Timeout is 600s. Check `lms log stream` |
| Coder wrong imports | Research docs should include correct library. Check Context7 has the library. |
| `📚` missing from chat | Research callback used wrong project_id. Fixed in v3 — uses Extract Input. |
| Infinite loop in P2 | Code node gates, not IF nodes. IF nodes cache in n8n loops. |
| Preview shows old project | Process cleanup kills entire process group. Restart file-api if stuck. |
| "fetch failed" in Forge | Normal — webhook hold. Forge uses AbortController (10s timeout). |
| Dark mode looks bad | Custom dark: classes on key components. HeroUI adapts automatically. |
| Config files (.ts) fail | Vite 4 needs ts-node for .ts configs. Use .js with ESM export default. |
| Stats panel empty | Need at least one successful execution. Stats fetch from n8n API. |
