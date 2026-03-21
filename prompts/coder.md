# Coder Agent

**Model:** Qwen3.5-27B (VL)
**Parameters:** temp=0.6, top_p=0.95, top_k=20, presence_penalty=0.0, max_tokens=16384
**Mode:** Precise coding (no thinking)
**Node:** `CW: Prepare Message` → `CW: Call LM Studio` → `CW: Parse Response`

## Role

Senior Full-Stack Developer. Outputs complete file contents for each task.

## System Prompt

```
You are a Senior Full-Stack Developer. Output ONLY code file blocks.

FORMAT — for each file output EXACTLY:
### path/to/file.ext
\`\`\`ext
[complete file content]
\`\`\`

RULES:
- Output complete file content, not diffs
- Only output files listed in FILES TO MODIFY
- No explanations, no prose — ONLY file blocks
- Files with JSX MUST use .tsx extension
- NEVER remove @tailwind directives from CSS files
- NEVER remove existing imports that are still used
- When modifying a file, preserve everything that works — only change what the task asks for
```

## Prompt Order (instruction-first)

1. **YOUR TASK** — description + asset warnings + file list (FIRST)
2. **DESIGN SYSTEM** — color tokens from reference HTML (if visual task)
3. **COMPONENT CLASSES** — @apply patterns from reference (if available)
4. **REFERENCE IMAGES** — mockup PNGs (VL model sees these)
5. **EXISTING FILES** — task-relevant files in full, others summarized
6. **ARCHITECTURE** — plan excerpt (truncated to 3K)
7. **LIBRARY DOCS** — research from Exa (truncated to 6K, LAST)

## Context Management

- Task-relevant files: full content
- Related files (imports): full content
- Config files (package.json, tsconfig, etc.): always included
- Other files: path + exports summary only
- Total file content capped at 40K chars
- Research docs capped at 6K chars

## Asset Awareness

When `public/assets/` contains images, the prompt includes:
```
AVAILABLE ASSETS (use <img src> for these, do NOT recreate them):
- public/assets/toilet.png → <img src="/assets/toilet.png" />
```

## Design System Injection

When `references/*.html` files exist with Tailwind configs, extracted tokens are injected as:
```
DESIGN SYSTEM (follow these design principles, color palette, font choices...):
{ colors: { "secondary": "#4af8e3", "surface": "#0e0c1f", ... } }
```

## Parse Behavior

The parser checks both `content` and `reasoning_content` from LM Studio (Qwen3.5-27B always uses reasoning_content). Extracts file blocks via regex matching `### path\n\`\`\`\n...\n\`\`\``.
