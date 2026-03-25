# eek.GO — AI Coding Pipeline

A local AI coding pipeline powered by **n8n**, **LM Studio**, and **eek-Forge**. Describe what you want to build, paste a reference screenshot, and the pipeline plans, codes, builds, audits, and writes files to disk automatically.

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
       n8n Webhook → eek.GO v4 Pipeline (42 nodes)
         │
         ├─ Planner (27B)
         │    Breaks request into 3-5 small tasks (max 3 edits each)
         │
         ├─ Research: Fetch Docs
         │    Import-aware filtering — only fetches docs for actually imported packages
         │
         ├─ Coder Loop (27B, per task, search/replace diffs)
         │    Deep API surface + full project context → targeted edits
         │    │
         │    ├─ TypeScript Check (tsc --noEmit)
         │    │    Self-correction loop with imported-file context (max 2 retries)
         │    │
         │    └─ Next task or exit loop
         │
         ├─ Build Check (vite build)
         │    Auto-fix loop if build fails (max 3 attempts)
         │
         ├─ Console Check (Playwright)
         │    Screenshot + console errors + 9 deterministic audits
         │
         ├─ Pipeline Report (deterministic)
         │    Build status + audit results + quality gate
         │
         ├─ Git Auto-Commit
         │    Per-project git repo snapshot after each run
         │
         ├─ Write Project Memory (memory.md)
         │    Goal, architecture, known issues, iteration history
         │
         └─ Status callbacks → eek-Forge (SSE)
              Files written → /home/will/src/{project_id}/
```

## Models

Single model pipeline — 27B stays loaded the entire run. No model swaps.

| Role | Model | Context | Temp | Purpose |
|------|-------|---------|------|---------|
| **Triage** | qwen/qwen3.5-9b | 32K | 0.6 | Quick conversational Q&A in Forge (separate) |
| **Planner** | qwen3.5-27b@q4_k_m | 65K | 0.6 | Task decomposition |
| **Coder** | qwen3.5-27b@q4_k_m | 65K | 0.6 | Code generation, search/replace diffs |
| **TS Fix** | qwen3.5-27b@q4_k_m | 65K | 0.6 | Self-correction from TypeScript errors |
| **Auto-Fix** | qwen3.5-27b@q4_k_m | 65K | 0.6 | Self-correction from build errors |

The triage agent (9B) runs in Forge before the pipeline starts. The pipeline itself uses only the 27B model.

## v4 Design Philosophy

**No LLM reviewer. No fixer. Deterministic checks only.**

The v3 pipeline had a 9B reviewer that scored quality and a 27B fixer that acted on those scores. In practice, the 9B couldn't accurately read 82K of code context and gave wrong feedback, causing the fixer to overwrite correct code. v4 removes both — the coder self-corrects from concrete error messages (TS errors, build failures), and deterministic Playwright audits catch visual/runtime issues.

This matches the approach used by Aider, Codex, and Claude Code: code → lint/typecheck → build → test → done.

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

These are the quality gate — no LLM opinions, just facts.

## Context Engineering

v4 uses several techniques to give the coder accurate information:

- **Deep API Surface** — extracts interfaces, types, and function signatures from highly-imported files (not just export names)
- **Import-aware research** — only fetches docs for packages actually imported in source files
- **File-size safety check** — rejects output files that shrink by >50% (prevents destructive rewrites)
- **Imported-file context for TS Fix** — when fixing type errors, includes files imported by the error file (resolves `@/` aliases)
- **Planner rule: component + consumer in same task** — prevents interface mismatches between new components and their parents

## Project Memory (memory.md)

Each project has a `memory.md` file that persists across pipeline runs:

- **Goal** — original request + refinements from follow-up messages
- **Architecture** — framework, deps, file count
- **Known Issues** — from build failures and console errors only (no LLM hallucinations)
- **Iteration History** — what was requested, built, and unresolved per run
- **Assets** — images, logos, reference files

The coder reads memory.md as project context for continuity across runs.

## Code Quality Features

- **Search/replace diffs** — coder outputs targeted edits for existing files instead of full rewrites
- **TypeScript check per task** — `tsc --noEmit` runs after each task, with self-correction loop (max 2 retries)
- **TS Fix with imported files** — includes files imported by the error file so it can fix both sides of a prop mismatch
- **File-size safety check** — prevents the TS Fix or Auto-Fix from destroying files with truncated output
- **Git auto-commit** — each pipeline run snapshots the project state for easy revert
- **Anti-rewrite rules** — coder prompt enforces "never rewrite a file from scratch"
- **Parser with lastIndexOf** — handles malformed search/replace blocks with multiple `=======` separators

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
- **Pipeline report** — build status, audit results, deterministic quality gate
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
| `qwen/qwen3.5-9b` | Triage (Forge only) |
| `qwen3.5-27b@q4_k_m` | Planner + Coder + TS Fix + Auto-Fix |

Configure: Flash Attention ON, KV Cache Quantization Q8_0, Max Concurrent Predictions 1.

## Environment Variables

All in `workflows/.env`:

| Variable | Purpose |
|----------|---------|
| `LLM_API_KEY` | Bearer token for LM Studio |
| `LM_STUDIO_URL` | Chat completions endpoint |
| `LM_STUDIO_HOST` | LM Studio base URL (model load/unload) |
| `CODER_MODEL` | `qwen3.5-27b@q4_k_m` |
| `AGENT_MODEL` | `qwen/qwen3.5-9b` |
| `CODER_CTX` | Coder context length (65536) |
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
curl -X POST http://localhost:5678/webhook/coding-agent-v4 \
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
| **Plan** | 27B | Breaks request into 3-5 small tasks |
| **Research** | — | Import-aware doc fetching (Context7 + Exa) |
| **Code** | 27B | Search/replace diffs per task (deep API surface + docs) |
| **TS Check** | 27B | `tsc --noEmit` per task — self-correction with imported files |
| **Build** | — | `vite build` — auto-fix loop if errors (max 3) |
| **Audit** | — | Playwright: screenshot + console + 9 deterministic checks |
| **Report** | — | Deterministic summary + audit data |
| **Git** | — | Auto-commit to per-project git repo |
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
│   └── eek-go-v3.json            v3 workflow (legacy, kept as backup)
├── prompts/                      Agent prompt documentation
│   ├── planner.md
│   ├── coder.md
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
| Model won't load | Check VRAM. 27B needs ~22GB across GPUs. |
| Content invisible | GSAP `gsap.from` + StrictMode issue. Use `gsap.fromTo`. |
| memory.md stale | Check Write Project Memory node for JS errors. |
| Build loop | Auto-fix limited to 3 attempts. Check build error in report. |
| Preview stuck | Restart file-api container. |
| TS Fix oscillating | Both sides of prop mismatch need fixing in same pass. |
