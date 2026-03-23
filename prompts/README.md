# eek.GO Pipeline Prompts

Each file documents one agent in the pipeline — its role, model, parameters, and prompt text.

## Pipeline Flow

```
User Message → Triage (9B, in Forge)
  → Planner (27B) → Research (MCP + Exa)
  → Coder Loop (27B, per task) → Build Check
  → Console Check (Playwright audits)
  → Code Review (9B VL, sees screenshot)
  → Fixer (27B, if critical issues)
  → Pipeline Report → Write Memory → Done
```

## Agents

| File | Agent | Model | Purpose |
|------|-------|-------|---------|
| [agent.md](agent.md) | Triage | qwen/qwen3.5-9b | READY_TO_BUILD or ask questions |
| [planner.md](planner.md) | Planner | qwen3.5-27b@q4_k_m | Break request into tasks |
| [coder.md](coder.md) | Coder | qwen3.5-27b@q4_k_m | Write/modify project files |
| [code-reviewer.md](code-reviewer.md) | Reviewer | qwen/qwen3.5-9b (VL) | Score quality from screenshot + code |
| [fixer.md](fixer.md) | Fixer | qwen3.5-27b@q4_k_m | Fix critical issues from review |

**Removed in v3:** Visual Reviewer (separate screenshot comparison), Final Reviewer (DeepSeek-R1-32B). Replaced by 9B VL reviewer with Playwright screenshot + deterministic audits.

## Model Parameters

| Role | temp | top_p | top_k | max_tokens | Mode |
|------|------|-------|-------|------------|------|
| Triage | 0.6 | 0.85 | — | 2048 | Conversational |
| Planner | 1.0 | 0.95 | 20 | 32768 | Reasoning (thinking) |
| Coder | 0.6 | 0.95 | 20 | 32768 | Precise coding |
| Reviewer | 0.7 | 0.8 | 20 | 131072 | VL + JSON output |
| Fixer | 0.6 | 0.95 | 20 | 32768 | Precise coding |

## Key Design Decisions

- **2 models, not 6** — simpler model management, only 27B + 9B swaps
- **Search/replace diffs** — coder edits existing files with targeted SEARCH/REPLACE blocks instead of full rewrites
- **TypeScript check per task** — `tsc --noEmit` after each task write, with auto-fix loop (max 2 retries)
- **Git auto-commit per run** — per-project git repo snapshots state after each pipeline run
- **9B VL as reviewer** — sees the actual screenshot, not just code
- **Deterministic audits** — 9 Playwright checks catch what the LLM misses
- **memory.md persistence** — project context survives across pipeline runs
- **Engineering principles in prompts** — fix root causes, no workarounds
- **Anti-rewrite rules** — coder prompt enforces preserving existing file structure
- **Instruction-first prompt order** — task first, research docs last
- **reasoning_content parsing** — LM Studio puts Qwen output here, parsers check both fields
- **User request in reviewer** — reviewer sees the original prompt to verify the task was addressed
- **Research docs in fixer** — fixer gets the same library docs as coder
- **GSAP MCP server** — real API docs prevent hallucinated methods
- **Scoring rules** — invisible content forces score below 50
