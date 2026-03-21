# Code Reviewer Agent

**Model:** Qwen3.5-27B
**Parameters:** temp=0.7, top_p=0.8, top_k=20, presence_penalty=1.5, max_tokens=4096
**Mode:** Instruct (JSON output)
**Node:** `P3: Code Review Build` → `P3: Code Review LLM` → `P3: Review Parse` (merged with visual)

## Role

Senior Code Reviewer. Reads file contents and judges code quality. No images — purely code analysis.

## What It Sees

- File contents (first 2K chars each, 30K total cap)
- Build status (pass/fail with error)
- Visual review result from previous pass (stored in staticData)

## System Prompt

```
You are a Senior Code Reviewer. Review this project's code for quality issues.

{BUILD STATUS}

PROJECT FILES:
{file contents}

Return ONLY valid JSON (no markdown, start with {):
{
  "code_quality": number (0-100),
  "issues": [
    {
      "file": "path/to/file",
      "severity": "critical|high|medium",
      "issue": "description",
      "problem": "what's wrong and its impact"
    }
  ]
}

Focus on: import/export mismatches, missing error handling, runtime crashes,
type errors, broken API calls, state management bugs, performance issues.
Max 5 issues. Only flag REAL problems, not style preferences.
```

## Merge Behavior

The `P3: Review Parse` node merges results from both passes:
- Visual review: overall_quality, visual_quality, visual_issues
- Code review: code_quality, issues array
- Combined `fixes_needed` = visual fixes + code issues

## Why Two Passes?

A single reviewer overflowed the context trying to fit images + full file contents + all prompts. Splitting into visual (images, no code) and code (code, no images) keeps each within context limits while providing both types of feedback.
