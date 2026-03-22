# eek.GO — AI Coding Pipeline

A local AI coding pipeline powered by **n8n**, **LM Studio**, and **eek-Forge**. Describe what you want to build, paste a reference screenshot, and the pipeline plans, codes, builds, audits, reviews, and writes files to disk automatically.

Built entirely on local LLMs — no cloud API costs, full privacy, full control.

**GitHub:** [github.com/eekanti/eek.GO](https://github.com/eekanti/eek.GO)

## Architecture

```
User → eek-Forge (chat UI)
         │
         ├─ Triage Agent (9B)
         │    READY_TO_BUILD or asks 1-3 clarifying questions
         │
         ▼
       n8n Webhook → eek.GO Pipeline (47 nodes)
         │
         ├─ Planner (27B, thinking enabled)
         │    Breaks request into 2-3 large tasks with visual specs
         │
         ├─ Research: Fetch Docs
         │    Context7 → GSAP MCP → Exa fallback + Design Guide
         │
         ├─ Coder Loop (27B, per task)
         │    Full project context + research docs + MCP → writes files
         │
         ├─ Build Check (vite build)
         │    Auto-fix loop if build fails (up to 3 attempts)
         │
         ├─ Console Check (Playwright)
         │    Screenshot + console errors + 9 deterministic audits
         │
         ├─ Code Review (9B VL, sees screenshot)
         │    Scores quality, flags critical issues, suggests next steps
         │
         ├─ Fixer (27B, if critical issues found)
         │    Targeted fixes with research docs + project memory
         │
         ├─ Pipeline Report (deterministic)
         │    Build status + audit results + quality score
         │
         ├─ Write Project Memory (memory.md)
         │    Goal, architecture, known issues, iteration history
         │
         └─ Status callbacks → eek-Forge (SSE)
              Files written → /home/will/src/{project_id}/
```

## Models

2 models, loaded one at a time via LM Studio load/unload API:

| Role | Model | Context | Temp | Purpose |
|------|-------|---------|------|---------|
| **Triage** | qwen/qwen3.5-9b | 32K | 0.6 | Quick conversational Q&A in Forge |
| **Planner** | qwen3.5-27b@q4_k_m | 65K | 1.0 | Task decomposition with thinking |
| **Coder** | qwen3.5-27b@q4_k_m | 65K | 0.6 | Code generation, 32K max output |
| **Reviewer** | qwen/qwen3.5-9b | 98K | 0.7 | VL model — sees screenshot + code |
| **Fixer** | qwen3.5-27b@q4_k_m | 65K | 0.6 | Targeted fixes with research docs |

Pipeline auto-swaps between 27B and 9B as needed. Only one model loaded at a time.

## Deterministic Audits (No LLM)

The Console Check node runs Playwright against the built project and performs:

| Audit | What it checks |
|-------|---------------|
| **Visibility** | Elements stuck at opacity: 0 |
| **Links** | Broken anchor targets (404s) |
| **Images** | Broken `<img>` src |
| **Contrast** | WCAG color contrast ratios |
| **Interactive** | Buttons/links blocked by overlays |
| **Content coverage** | % of page with visible content |
| **Responsive** | Horizontal overflow at 375px |
| **Alt text** | Images missing alt attributes |
| **Empty sections** | Headings with no content below |

These catch issues the LLM reviewer misses — invisible content, broken links, accessibility failures.

## Project Memory (memory.md)

Each project has a `memory.md` file that persists across pipeline runs:

- **Goal** — original request + refinements from follow-up messages
- **Architecture** — framework, deps, file count
- **Decisions** — things the pipeline should NOT change (URLs, imports, assets)
- **Known Issues** — accumulated from audits and reviews
- **Iteration History** — what was requested, built, and unresolved per run
- **Assets** — images, logos, reference files

The coder and fixer read memory.md as project context, so they understand what was already built and what's still broken.

## Services

| Service | Port | Purpose |
|---------|------|---------|
| **n8n** | 5678 | Workflow engine — runs the eek.GO pipeline |
| **LM Studio** | 1234 | Local LLM server (10.0.0.100) — hosts models |
| **file-api** | 3456 | File CRUD + Playwright audits + Build & Preview |
| **eek-Forge** | 3500 | Chat UI — projects, conversations, live preview |
| **docky** | 8811 | MCP gateway — Context7, GSAP, GitHub, Exa, more |

## eek-Forge Features

- **Chat-based interface** — send prompts, paste images
- **Triage agent** — asks clarifying questions before building
- **Real-time status** via SSE — watch each pipeline phase
- **Build & Preview** — one-click dev server with live iframe
- **Suggestions** — actionable next steps from the reviewer
- **Pipeline report** — build status, audit results, quality score
- **Project management** — create, rename, delete projects
- **Dark mode** — persistent preference
- **SQLite persistence** — chat history survives restarts

## Setup

### 1. Configure environment

```bash
cp .env.example workflows/.env
# Edit workflows/.env — set model names and API keys
```

### 2. Deploy

```bash
./deploy.sh
```

### 3. Models

Download in LM Studio:

| Model | Role |
|-------|------|
| `qwen/qwen3.5-9b` | Triage + Reviewer (VL) |
| `qwen3.5-27b@q4_k_m` | Planner + Coder + Fixer |

Configure: Flash Attention ON, KV Cache Quantization Q8_0, Max Concurrent Predictions 1.

## Environment Variables

All in `workflows/.env`:

| Variable | Purpose |
|----------|---------|
| `LLM_API_KEY` | Bearer token for LM Studio |
| `LM_STUDIO_URL` | Chat completions endpoint |
| `LM_STUDIO_HOST` | LM Studio base URL (model load/unload) |
| `CODER_MODEL` | `qwen3.5-27b@q4_k_m` |
| `REVIEWER_MODEL` | `qwen/qwen3.5-9b` |
| `AGENT_MODEL` | `qwen/qwen3.5-9b` |
| `CODER_CTX` | Coder context length (65536) |
| `REVIEWER_CTX` | Reviewer context length (98304) |
| `FILE_API_URL` | `http://file-api:3456` |
| `FILE_API_TOKEN` | Bearer token for File API |

## Usage

### Via eek-Forge (recommended)

Open **http://localhost:3500**

1. Click **+ New project**
2. Type what you want to build
3. Watch status updates stream in real-time
4. Click **Build & Preview** to see the live app
5. Send follow-up prompts to iterate

### Via curl

```bash
curl -X POST http://localhost:5678/webhook/coding-agent \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Build a landing page with hero section and features grid",
    "project_id": "my-project"
  }'
```

## Pipeline Flow

| Step | Agent | What happens |
|------|-------|-------------|
| **Triage** | 9B | Forge asks questions or sends READY_TO_BUILD |
| **Plan** | 27B | Breaks request into tasks with visual specs |
| **Research** | — | Context7 + GSAP MCP + Exa fetch library docs |
| **Code** | 27B | Writes files per task (full project context + docs) |
| **Build** | — | `vite build` — auto-fix loop if errors |
| **Audit** | — | Playwright: screenshot + console + 9 checks |
| **Review** | 9B VL | Sees screenshot, scores quality, flags issues |
| **Fix** | 27B | Targeted fixes if critical issues found |
| **Report** | — | Deterministic summary + audit data |
| **Memory** | — | Updates memory.md for next iteration |

## File Structure

```
eek.GO/
├── file-api/                     File CRUD + Playwright audits + Build & Preview
│   ├── app.js                      Express server
│   ├── Dockerfile                  Node 20 + Chromium
│   └── package.json
├── forge/                        eek-Forge chat UI
│   ├── server.js                   Express backend (chat, SSE, triage, SQLite)
│   ├── src/                        React frontend (Vite + Tailwind)
│   ├── Dockerfile                  Multi-stage build
│   └── package.json
├── workflows/
│   ├── .env                      Pipeline configuration
│   ├── eek-go-v3.json            Main workflow (deployed to n8n)
│   └── eek-go.json               v2 backup
├── prompts/                      Agent prompt documentation
│   ├── planner.md
│   ├── coder.md
│   ├── code-reviewer.md
│   ├── fixer.md
│   └── README.md
├── docs/
│   ├── pipeline-architecture.md  Full pipeline flow documentation
│   ├── n8n.md                    n8n expression reference
│   └── Troubleshooting Guide.md
├── deploy.sh                     Automated deployment
└── README.md
```

## Troubleshooting

See [docs/Troubleshooting Guide.md](docs/Troubleshooting%20Guide.md).

| Problem | Fix |
|---------|-----|
| Model won't load | Check VRAM. Only one model at a time. |
| Content invisible | GSAP `gsap.from` + StrictMode issue. Use `gsap.fromTo`. |
| Reviewer gives wrong score | Audits are the source of truth, not the LLM score. |
| memory.md stale | Check Write Project Memory node for JS errors. |
| Build loop | Auto-fix limited to 3 attempts. Check build error in report. |
| Preview stuck | Restart file-api container. |
