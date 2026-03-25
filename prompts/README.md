# eek.GO v4 — Agent Prompts

Documentation for each agent's system prompt, parameters, and behavior.

## Agents

| File | Agent | Model | Status |
|------|-------|-------|--------|
| planner.md | Planner | qwen3.5-27b@q4_k_m | Active |
| coder.md | Coder | qwen3.5-27b@q4_k_m | Active |

### Removed in v4

| File | Agent | Reason |
|------|-------|--------|
| code-reviewer.md | Reviewer (9B VL) | Could not accurately read 82K code context; gave wrong feedback |
| fixer.md | Fixer (27B) | Acted on reviewer's wrong feedback; overwrote correct code |

v4 uses **deterministic checks only** (TS check, build check, Playwright audits). The coder self-corrects via TS Fix and Auto-Fix loops.

## Model Parameters

| Agent | temp | top_p | top_k | max_tokens |
|-------|------|-------|-------|------------|
| Planner | 0.6 | 0.95 | 20 | 32768 |
| Coder | 0.6 | 0.95 | 20 | 32768 |
| TS Fix | 0.6 | 0.95 | 20 | 32768 |
| Auto-Fix | 0.6 | 0.95 | 20 | 32768 |

All agents use the same 27B model. No model swaps during pipeline execution.

## Key Design Decisions

1. **Search/replace diffs** — coder outputs targeted edits, not full file rewrites
2. **3-5 small tasks** — each task modifies max 3 files with max 3 search/replace blocks
3. **Component + consumer in same task** — prevents interface mismatches
4. **Deep API surface** — planner and coder see full interface definitions
5. **Import-aware research** — only fetches docs for actually imported packages
6. **File-size safety check** — rejects output that shrinks a file by >50%
7. **TS Fix with imported files** — includes imported files for prop mismatch fixes
8. **No LLM review** — deterministic Playwright audits are the quality gate
