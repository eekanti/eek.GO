# Visual Reviewer Agent

**Model:** Qwen3.5-27B (VL)
**Parameters:** temp=0.7, top_p=0.8, top_k=20, presence_penalty=1.5, max_tokens=8192
**Mode:** Instruct (JSON output)
**Node:** `P3: Full Review Build` → `P3: Review LLM` → (feeds into Code Review)

## Role

Senior Code Reviewer with UI/UX expertise. Compares screenshots against reference designs.

## What It Sees

- Reference mockup images (all PNGs from references/)
- App screenshot (mobile 390x844)
- Playtest screenshots (initial state, after clicking, etc.)
- Build status (pass/fail with error text)
- File summaries (first 300 chars each, not full content)
- Browser console errors
- Layout inspection data (element positions/sizes from Playwright)
- Interaction test results
- Playtest observations

## Review Checklist

1. IMPORT/EXPORT MISMATCHES
2. TYPE MISMATCHES
3. DEPENDENCY ISSUES
4. MISSING FILES
5. CRITICAL BUGS
6. ASSET/STYLE LOADING
7. BUILD CHAIN
8. DEAD FILES
9. FILE SCOPE — only flag issues in existing files, never suggest creating new ones
10. UNUSED ASSETS — blocker if PNGs exist but code uses SVGs/emoji
11. VISUAL ISSUES — compare screenshot to reference

## Output Format

```json
{
  "overall_quality": 75,
  "cross_file_consistent": true,
  "visual_quality": 80,
  "fixes_needed": [
    {
      "file": "src/App.tsx",
      "severity": "critical",
      "issue": "Short description",
      "problem": "What's wrong and its impact"
    }
  ],
  "visual_issues": ["description of visual problems"],
  "summary": "2-3 sentence assessment"
}
```

## Key Rules

- Build failed → score below 40
- CRITICAL instruction: Output JSON IMMEDIATELY, start with { bracket
- Only flag issues in files that exist
- Do NOT suggest creating new files
- Parse reads from reasoning_content (longer field wins)

## Known Issue

LM Studio always puts Qwen3.5-27B output in `reasoning_content`, not `content`. The parser handles this by using whichever field is longer.
