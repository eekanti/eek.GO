# eek-Go v3 Pipeline Architecture

47 nodes | 2 models | 12 deterministic checks | Fully local

## Pipeline Flow

```
⊙ Webhook
  Entry point

→ Extract Input
  Parse message, project_id

→ CB: Pipeline Started
  → Forge status

→ Fetch Project Files
  GET /files-content from file-api

→ Prepare Planner Input
  Build context, extract memory.md, cache static data

→ Startup: Unload All
  Unload all LM Studio models

→ Load Model
  Load 27B @ 65K context

→ Planner: Build Request
  Build planner prompt from static data

→ Planner: Call LM Studio
  27B plans tasks (thinking enabled)

→ Planner: Parse Response
  Extract JSON tasks

→ CB: Planning Complete
  → Forge status

→ Research: Fetch Docs
  Context7 → GSAP MCP → Exa fallback

→ Spread Tasks
  Topological sort, build task queue

┌─── TASK LOOP (per task) ───
│ → P2: Stash Context
│   Cache task data for coder
│ → P2: Build Code Input
│   Prepare file context for coder
│ → CW: Prepare Message
│   Build coder prompt + MCP docs + images
│ → CW: Call LM Studio
│   27B writes code
│ → CW: Parse Response
│   Extract ### file blocks
│ → P2: Prepare Write
│   Filter files, merge package.json
│ → P2: Write Files
│   POST /files-batch to file-api
│ → P2: Store Result
│   Track written files
│ → P2: Exit Gate
│   Loop back or continue
└─────────────────────────

→ Build Check
  npm install + vite build via file-api

⑂ Build Route — splits on build result
├─ Auto-Fix Gate → Auto-Fix loop (if build failed)
└─ Build Pass Gate → continues below

→ Console Check
  Playwright: console errors + screenshot + 9 audits
    visibility | links | images | contrast
    interactive | content | responsive | alt-text | empty-sections

→ Swap: Load 9B
  Unload 27B, load 9B for review

→ Code Review: Build
  Build reviewer prompt with screenshot + audits

→ Code Review: Call LM Studio
  9B VL reviews (sees screenshot)

→ Code Review: Parse
  Extract JSON, normalize fields

⑂ Review Route — splits on critical issues
├─ Critical Bug Gate → Swap: Load 27B → Fix: Build → Fix: Call → Fix: Parse → Fix: Write
└─ No Bug Gate → continues below

→ Pipeline Report
  Deterministic summary + audit results

→ Write Project Memory
  Update memory.md (goal, issues, history)

→ CB: Pipeline Complete
  → Forge status + suggestions

→ Unload Model
  Unload all models
```

## Models

| Model | Size | Role | Context |
|-------|------|------|---------|
| qwen3.5-27b@q4_k_m | 27B | Planner, Coder, Fixer | 65K |
| qwen/qwen3.5-9b | 9B | Triage (Forge), Reviewer (VL) | 65K |

## Deterministic Checks (no LLM)

All run during a single Playwright browser session (~10s):

| Check | What it catches |
|-------|----------------|
| vite build | Compile errors, type errors, missing imports |
| Console errors | Runtime crashes, uncaught exceptions |
| Visibility audit | Elements stuck at opacity 0 |
| Link validation | Broken anchor targets (#id not found) |
| Image validation | Broken `<img>` src (404, not loaded) |
| Contrast check | WCAG ratio failures on text elements |
| Interactive check | Buttons/links blocked by overlays |
| Content coverage | % of page height with visible content |
| Responsive check | Horizontal overflow at 375px mobile |
| Alt text check | Images missing alt attribute |
| Empty section check | Headings with no content below them |
| Performance | DOM load time, total element count |

## Persistence

| System | Purpose |
|--------|---------|
| `memory.md` | Project goal, architecture, known issues, iteration history |
| Forge SQLite | Chat history, execution tracking, project metadata |
| Workflow static data | Per-execution cache (reset each run) |

## Infrastructure

| Service | Port | Purpose |
|---------|------|---------|
| n8n | 5678 | Workflow engine |
| file-api | 3456 (internal) | File storage, build, preview, console check + audits |
| Forge | 3500 | Chat UI, status callbacks, triage agent |
| LM Studio | 10.0.0.100:1234 | Local LLM inference |
| MCP Gateway (docky) | 8811 | Context7, GSAP MCP, Exa, Playwright, GitHub, etc. |

## MCP Servers

| Server | Tools | Purpose |
|--------|-------|---------|
| Context7 | resolve-library-id, get-library-docs | Library documentation |
| GSAP Master | get_gsap_api_expert, debug_animation_issue, create_production_pattern | GSAP animation reference |
| Exa | get_code_context_exa | Web search fallback for docs |
| Magic (21st.dev) | search_components, generate_component | UI component examples |
| Playwright | browser_navigate, browser_screenshot, etc. | Browser automation |
| GitHub | create_pull_request, search_code, etc. | GitHub operations |
| n8n MCP | n8n_get_workflow, n8n_validate_workflow, etc. | Workflow management |
