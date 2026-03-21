# eek-Go Pipeline Prompts

Each file documents one agent in the pipeline — its role, model, parameters, prompt text, and behavior.

## Pipeline Flow

```
User Message → Agent (triage) → Planner → Research → Stitch Concepts
  → Coder (per task) → Build Check → Playtest
  → Visual Reviewer → Code Reviewer → Review Parse
  → Fixer (if needed) → Post-Fix Build → Visual Loop
  → Final Reviewer → Pipeline Report
```

## Agent Files

| File | Agent | Model | Purpose |
|------|-------|-------|---------|
| [agent.md](agent.md) | Pre-Planning Triage | Qwen3.5-9B | Decide: build or ask questions |
| [planner.md](planner.md) | Task Planner | Qwen3.5-27B VL | Break request into tasks |
| [coder.md](coder.md) | Code Writer | Qwen3.5-27B VL | Write/modify project files |
| [visual-reviewer.md](visual-reviewer.md) | Visual Reviewer | Qwen3.5-27B VL | Compare screenshots to references |
| [code-reviewer.md](code-reviewer.md) | Code Reviewer | Qwen3.5-27B | Review code quality (no images) |
| [fixer.md](fixer.md) | Code Fixer | Qwen3.5-27B VL | Fix issues from review |
| [final-reviewer.md](final-reviewer.md) | Final Reviewer | DeepSeek-R1-32B | Score + suggest next steps |

## Model Parameters (Qwen3.5 Recommended)

| Role | temp | top_p | top_k | presence_penalty | Mode |
|------|------|-------|-------|------------------|------|
| Agent | 0.6 | 0.85 | - | - | Conversational |
| Planner | 1.0 | 0.95 | 20 | 1.5 | Reasoning |
| Coder | 0.6 | 0.95 | 20 | 0.0 | Precise coding |
| Reviewer | 0.7 | 0.8 | 20 | 1.5 | Instruct/JSON |
| Fixer | 0.6 | 0.95 | 20 | 0.0 | Precise coding |
| Final | 0.3 | 0.7 | - | - | Reasoning (DeepSeek) |

## Key Architectural Decisions

- **Instruction-first prompt order** — task description is FIRST in the user message, research docs LAST
- **Two-pass review** — visual (images, no code) + code (code, no images) fit in context separately
- **reasoning_content** — LM Studio always puts Qwen3.5-27B output here, all parsers check both fields
- **Design system injection** — Tailwind config extracted from reference HTML, injected before code context
- **Asset enforcement** — coder/fixer/reviewer all warned about unused PNGs in public/assets/
- **Fixer gate** — Code node gates (not IF nodes) prevent phantom file creation
- **Pipeline report** — deterministic checks at the end catch scoring bugs, missing @tailwind, etc.
