# eek-Go Pipeline v5 Optimization Plan

*Compiled 2026-03-20 based on execution data analysis, framework research, and web research.*

---

## Executive Summary

The v4 pipeline has a **50% failure rate** and **~33% runtime waste** from two critical bugs:
1. The reviewer never produces valid JSON (reasoning model fills token budget with thinking)
2. The fixer gate (IF node) doesn't actually block, so the fixer always runs and creates phantom files

Fixing these two issues alone would cut successful run time from ~15min to ~9min and reduce failures from 50% to ~15%.

Beyond bug fixes, the pipeline has architectural inefficiencies that limit quality on the "last 20%" of polish work. This plan addresses both.

---

## Part 1: Critical Bug Fixes (Deploy Immediately)

### 1.1 Reviewer Never Produces JSON
**Problem:** Qwen3.5-27B is a reasoning model. It puts ALL output in `reasoning_content` (thinking tokens), filling the 8192 max_tokens budget with analysis before producing any `content`. The reviewer parse finds no JSON and falls back to `quality: 0, fixes_needed: []`.

**Impact:** 100% of reviews fail to produce actionable feedback. ~146s wasted per run.

**Fix (DEPLOYED):**
- Disabled thinking mode: `chat_template_kwargs: { enable_thinking: false }`
- Added "Output JSON IMMEDIATELY — start with { bracket" instruction
- Improved parse to search `reasoning_content` for JSON as fallback

**Alternative fix if disable_thinking doesn't work with LM Studio:**
- Use a different model for review (DeepSeek-R1-32B already used for final review — could consolidate)
- OR reduce prompt size drastically so more token budget is available for JSON output

### 1.2 Fixer Gate Doesn't Block
**Problem:** The `P3: Needs Fix?` IF node routes to the fixer even when `critical_fix_count: 0`. This is the n8n IF node type coercion bug — `0 > 0` evaluates to TRUE due to expression handling.

**Impact:** Fixer runs every time (~140s + phantom App.tsx creation), even when no fixes are needed.

**Fix (DEPLOYED):**
- Replaced IF node with Code node gate pattern (same as P2 loop)
- `P3: Route Decision` → `P3: Fix Gate` (passes through if needs fix) + `P3: Skip Gate` (passes through if no fix)
- Gate logic: `needsFix = fixes.length > 0 && criticalCount > 0 && quality > 0`
- The `quality > 0` check ensures parse-failed reviews skip the fixer entirely

### 1.3 String Escaping in Code Nodes
**Problem:** When Python scripts edit the workflow JSON, `str.replace()` converts `\n` to actual newlines inside single-quoted JS strings, breaking the n8n Code node parser.

**Impact:** 60% of failures are caused by this.

**Fix:** Process discipline — use raw strings (`r'...'`) in all Python workflow edits. Not a code change, a practice change. Could also validate the workflow JSON after each edit by checking for unescaped newlines in jsCode strings.

---

## Part 2: Efficiency Improvements (Reduces ~15min to ~8min)

### 2.1 Skip Model Swaps When Same Model
Since planner, coder, reviewer, and fixer all use Qwen3.5-27B, the load/unload cycle is unnecessary. The model is already loaded.

**Current:** 5 model loads × ~4-20s = ~36s overhead (4%)
**Proposed:** Check if target model matches currently loaded model. Skip load if same.
**Savings:** ~30s per run

### 2.2 Eliminate Redundant Build Checks
The pipeline runs build checks at 3 points: Build Check, Post-Fix Build Check, and Final Review Build. The Final Review also runs a full `vite build`.

**Proposed:**
- Build Check after coder: KEEP (catches compile errors early)
- Post-Fix Build Check: KEEP but SKIP Playwright MCP (just run `vite build`, no screenshot)
- Final Review Build: REMOVE the build check — the Final Review should only read code, not rebuild

**Savings:** ~25-30s per run

### 2.3 Make Playtest Optional
The Playtest phase adds ~23s and generates 4 screenshots + 3 observations. But the click test shows "counter stayed at 326" because Playwright clicks happen faster than React can re-render.

**Proposed:** Make playtest opt-in via planner flag `needs_playtest: true`. Only run for interactive apps (games, forms). Skip for static sites, CLI tools, API backends.

### 2.4 Reduce Research Doc Size
Research docs (Exa + Magic UI) add ~10-15K chars to every coder prompt. For follow-up requests on existing projects, these docs are mostly redundant (the project already has its dependencies installed).

**Proposed:** Skip research on follow-up requests (when project already has files). Only fetch docs for:
- New projects (empty file list)
- Requests that mention new libraries not in package.json
- Explicit "use X library" instructions

**Savings:** ~17s per run + smaller coder prompts

---

## Part 3: Quality Improvements (The "Last 20%" Problem)

### 3.1 The Core Problem
The pipeline gets 70-80% right on initial generation but fails at iterative refinement. This is because:
1. The reviewer doesn't produce useful feedback (broken — fixed above)
2. The fixer rewrites entire files instead of making targeted changes
3. The coder ignores specific instructions (like "use this PNG asset")
4. Follow-up requests regenerate files instead of editing them

### 3.2 Diff-Based Editing (Aider's Approach)
**Research finding:** Aider uses "search/replace" blocks instead of full file replacement. The model outputs:
```
<<<< SEARCH
old code to find
====
new code to replace with
>>>> REPLACE
```

This is dramatically more accurate for small changes because:
- The model only needs to generate the changed lines, not the entire file
- It forces the model to identify the exact location of the change
- It's smaller token output = faster + less error-prone

**Proposal:** Add a "diff mode" for the fixer. When the reviewer identifies specific line-level fixes, the fixer should output search/replace blocks instead of full files. The pipeline applies them as patches.

This doesn't replace full-file mode for the coder (which creates new files), but supplements it for fix operations.

### 3.3 Reviewer Prompt Restructure
The current reviewer prompt asks for 10 different types of analysis. This overwhelms the model and produces unfocused reviews. The OneRedOak approach (from research) structures the review into phases:

**Proposed reviewer phases (in priority order):**
1. **Build status** — did it compile? If not, that's the ONLY fix needed.
2. **Asset usage** — are the project's PNG/SVG assets used? Blocker if not.
3. **Visual comparison** — does the screenshot match the reference? 1-2 specific visual issues max.
4. **Code bugs** — import mismatches, type errors, runtime crashes. Max 3 fixes.

Cap at 5 total fixes per review. The current prompt asks for unlimited issues, which causes the model to produce novels instead of JSON.

### 3.4 Planner Quality
The planner is the most important node — it determines what the coder builds. Current issues:
- Creates too many tasks for simple changes (3-4 tasks for a CSS tweak)
- Creates "delete files" tasks the coder can't execute
- Doesn't always include asset files in the task file list

**Proposed planner improvements:**
- For follow-up requests (existing project with files), default to 1-2 tasks max
- Never create tasks that only delete files
- Always scan `public/assets/` and include relevant assets in the file list
- Include `needs_playtest` and `needs_concept` flags per task

### 3.5 Coder Context Management
The v4 context fix (task-relevant files only) brought prompts from 140K to 25-40K. But the coder still sometimes ignores instructions.

**Research finding:** "Context engineering" is more important than prompt engineering. The order of information matters:
1. Task description (what to do) — FIRST
2. Asset warnings — SECOND (before any code)
3. Existing file contents — THIRD
4. Research docs — LAST (least important for follow-ups)

Currently the order is: system prompt → research docs → reference images → task description → files. The task description is buried at the bottom.

**Proposed:** Restructure the coder prompt:
1. System rules (short, 500 chars max)
2. Task description + asset warnings (what to do, prominently)
3. Reference images (if any)
4. Files to modify (full content)
5. Other files (summary only)
6. Research docs (truncated, only if new project)

---

## Part 4: Architecture Simplification

### 4.1 Nodes to Remove
Based on execution data, these nodes add overhead without value:

| Node | Time | Issue | Recommendation |
|------|------|-------|----------------|
| Multi-viewport screenshots (768px, 1440px) | ~5s | Never caught a responsive issue | Remove, keep only mobile 390px |
| Interaction test in Build Check | ~3s | Playwright click test unreliable with React | Remove, playtest handles this |
| Stitch Task Concepts | ~15-45s | Generated 0 concepts in all observed runs | Make truly optional, fix API call |
| P2: Continue Gate / Exit Gate | ~0s | Adds n8n overhead per loop iteration | Keep, necessary for loop control |

### 4.2 Nodes to Consolidate
| Current | Proposed |
|---------|----------|
| Load Model + Restore nodes (×5 pairs) | Single "Ensure Model Loaded" Code node per phase |
| Build Check + Playtest (separate) | Build Check includes optional playtest |
| P4: Fix Build + P4: Fix LLM + P4: Fix Parse + P4: Fix Write | Could be 2 nodes instead of 4 |
| CB: Pipeline Started + CB: Planning Complete + CB: Review Complete + etc. | Single callback node with event type parameter |

### 4.3 The Minimal Pipeline (for quick iterations)
For simple follow-up requests ("make the counter bigger", "change the button color"), the full pipeline is overkill. A "fast mode" could be:

```
Planner (1 task) → Coder → Build Check → Done
```

Skip: research, Stitch, playtest, reviewer, fixer, final review. The user provides the review themselves by looking at the result.

**Trigger:** Planner detects a simple change request and sets `fast_mode: true`. Or the user prefixes with "quick:" in Forge.

---

## Part 5: Implementation Priority

### Immediate (already deployed):
- [x] Reviewer thinking mode disabled
- [x] JSON-first instruction added
- [x] P3: Needs Fix? replaced with Code node gates
- [x] Review parse checks reasoning_content for JSON

### Next session:
1. [ ] Verify reviewer fix works (run a test)
2. [ ] Restructure reviewer prompt (cap at 5 fixes, priority order)
3. [ ] Restructure coder prompt order (task first, docs last)
4. [ ] Add "fast mode" bypass for simple changes
5. [ ] Skip research on follow-up requests
6. [ ] Remove multi-viewport screenshots
7. [ ] Implement diff-based editing for fixer

### Future:
- [ ] Consolidate model load/unload nodes
- [ ] Consolidate callback nodes
- [ ] Add planner `fast_mode` flag
- [ ] Investigate parallel task execution (coder tasks 1 and 2 simultaneously if independent)

---

## Appendix: Execution Data Summary

| Metric | Current v4 | Projected v5 |
|--------|-----------|--------------|
| Success rate | 50% | ~85% |
| Avg run time (success) | 14.7 min | ~8 min |
| Reviewer produces valid JSON | 0% | ~90% |
| Fixer creates phantom files | 100% | 0% |
| Token waste (reviewer+fixer) | ~49K/run | ~15K/run |
| Wasted compute in failed runs | ~49 min total | ~10 min total |
