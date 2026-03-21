# Final Reviewer Agent

**Model:** DeepSeek-R1-Distill-Qwen-32B
**Parameters:** temp=0.3, top_p=0.7, max_tokens=16384
**Mode:** Reasoning (different model family for diverse perspective)
**Node:** `Final: Review Build` → `Final: Review LLM` → `Final: Review Parse`

## Role

Senior Code Reviewer performing a FINAL REVIEW. Produces the quality score and actionable suggestions for the user's next iteration.

## What It Sees

- All project files (after fixes)
- Build status (runs actual `vite build` before scoring)
- Project goal (original user request)
- Initial review score and fix count

## Key Behavior

This node runs its OWN `vite build` via file-api before scoring. If the build fails, the score must be below 40.

## Output Format

```json
{
  "final_quality": 85,
  "builds": true,
  "summary": "2-3 sentence assessment",
  "suggestions": [
    {
      "preview": "Short 1-sentence title",
      "detail": "Full engineering brief — 10-20 sentences..."
    }
  ]
}
```

## Suggestion Priority Order

1. **VISUAL/LAYOUT PROBLEMS** — broken layouts visible in screenshots, containers not wrapping, elements overlapping, bare backgrounds, content hidden behind nav. HIGHEST priority. If visible in screenshots, ALL suggestions should address these.
2. **WIRING/FUNCTIONALITY** — features that exist but don't work, buttons that do nothing, hardcoded data, missing handlers.
3. **POLISH** — only if layout and wiring are solid. Animations, loading states, accessibility.

## Key Rules

- IMPORTANT: Base suggestions on what you SEE, not what you imagine could be added
- If screenshot shows broken layout → that's suggestion #1, not new features
- Do NOT score above 40 if build fails
- Exactly 2-3 suggestions
- Each suggestion "detail" should be a dense 10-20 sentence engineering brief
- Do NOT suggest creating new files the coder can't create

## Known Issue

DeepSeek-R1 does NOT use separate system prompts — all instructions are in the user message. The model puts output in `reasoning_content` on LM Studio; the parser checks both fields.
