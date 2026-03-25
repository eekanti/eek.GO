# eek.GO v4 Pipeline Architecture

42 nodes | 1 model (27B) | 9 deterministic audits | Git versioned | Fully local

## Pipeline Flow

```
Webhook → Extract Input → CB: Pipeline Started → Fetch Project Files →
  Prepare Planner Input (deep API surface + import counting) →
  Load Model (27B, idempotent) →

  Planner: Build Request → Call LM Studio → Parse Response →
  CB: Planning Complete → Research: Fetch Docs (import-aware) →
  Spread Tasks →

  ┌─── TASK LOOP (per task) ─────────────────────────────────────┐
  │ P2: Stash Context → P2: Build Code Input →                   │
  │ CW: Prepare Message → CW: Call LM Studio → CW: Parse →       │
  │ P2: Prepare Write → P2: Write Files →                        │
  │ TypeScript Check                                              │
  │   ├─ PASS → P2: Store Result                                 │
  │   └─ FAIL → TS Fix: Build (with imported files) →            │
  │            TS Fix: Call LM Studio → TS Fix: Parse →           │
  │            TS Fix: Write → TypeScript Check (max 2 retries)   │
  │ → P2: Store Result → P2: Continue Gate / P2: Exit Gate       │
  └───────────────────────────────────────────────────────────────┘

  → Build Check
    ├─ FAIL → Auto-Fix: Prepare → Call → Parse → Write → Build Check (max 3)
    └─ PASS →

  → Console Check (Playwright: screenshot + console errors + 9 audits) →

  → Pipeline Report (deterministic — build + console + TS + audits) →
  → Git: Auto-Commit →
  → Write Project Memory →
  → CB: Pipeline Complete
```

## What v4 Removed (vs v3)

| Removed Node | Reason |
|-------------|--------|
| Swap: Load 9B | No model swaps — 27B stays loaded |
| Code Review: Build/Call/Parse | 9B couldn't read 82K code accurately |
| Critical Bug Gate | No reviewer to gate on |
| No Bug Gate | No reviewer bypass needed |
| Swap: Load 27B | No model swaps |
| Fix: Build/Call/Parse/Write | Fixer acted on wrong reviewer feedback |
| Post-Fix Verify | No fixer to verify |
| Startup: Unload All | Simplified to idempotent Load Model |
| Unload Model | Model left loaded for faster next run |

## Context Engineering

### Deep API Surface (Prepare Planner Input)

For files imported by 2+ other files, the pipeline extracts:
- Full interface/type definitions (not just `export interface Foo {...}`)
- Non-exported interfaces used in createContext or return types
- Function signatures with parameter types

This gives the coder exact property names and types — no guessing.

### Import-Aware Research (Research: Fetch Docs)

Before fetching docs for a package, the pipeline greps source files for actual imports. Packages listed in package.json but never imported are skipped.

### TS Fix with Imported Files

When a TypeScript error occurs in a file, the TS Fix node also includes files imported by the error file. This resolves the common "prop mismatch" problem where GameScreen passes wrong props to a child component — the TS Fix sees both files and can fix both sides.

Supports both relative imports (`../context/GameContext`) and alias imports (`@/context/GameContext`).

### File-Size Safety Check

All parsers (CW: Parse, TS Fix: Parse, Auto-Fix: Parse) reject output files that are less than 50% the size of the original. This prevents the model from accidentally truncating a file when a search/replace block fails to match and falls through to the full-file parser.

### Planner Task Rules

- 3-5 small tasks, max 3 search/replace blocks each
- New component + its consumer must be in the same task (prevents interface mismatches)
- Each task touches max 3 existing files

## Deterministic Checks

### TypeScript Check (per task)
- Runs `tsc --noEmit` via file-api
- If errors found: TS Fix loop (max 2 retries) with imported-file context
- TS Fix prompt instructs: fix both sides of a prop mismatch in one pass

### Build Check (post-loop)
- Runs `vite build` via file-api
- If fails: Auto-Fix loop (max 3 retries) with config files + error files

### Console Check (Playwright)
- Launches built project in headless Chromium
- Takes screenshot (stored in staticData for reference)
- Captures console errors and page crashes
- Runs 9 deterministic audits (visibility, links, images, contrast, etc.)

## Pipeline Report

The report is purely deterministic — no LLM opinions:
- Build: passed/failed
- Console: clean/errors/page crash
- Audits: visibility, broken links, broken images, contrast, etc.
- Quality gate: deterministic checks only
