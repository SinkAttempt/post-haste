# Post Haste

Portrait mobile arcade idle — run a post office. Sort mail, serve customers, upgrade your operation.

## Stack
- Web prototype: HTML5 Canvas, Vanilla JS
- Deploy: GitHub Pages (auto-deploy on push to main)
- Future: Unity (if validated)
- Live: https://sinkattempt.github.io/post-haste/

## Knowledge Base (Tiddles Standard)
- `kb/subject/` — Genre research, competitor benchmarks, feedback loops
- `kb/project/` — Game design, tech state, session history, asset manifest
- `kb/instructions.md` — Living rulebook: design rules derived from research + feedback
- **RULE:** When changing design or code, update relevant kb/ files
- KB structured for LLM consumption (content generation, social posts)

## Key Files
- `kb/project/game-design.md` — full game design doc
- `kb/project/tech.md` — tech decisions and prototype scope
- `kb/project/history.md` — session save states
- `kb/subject/benchmarks.md` — competitor/market research
- `kb/subject/feedback-loops.md` — data -> learning -> action
- `kb/instructions.md` — design rules derived from all KB data
- `src/game.js` — all prototype code (single file)
- `public/index.html` — entry point

## Git
- Repo: SinkAttempt/post-haste (personal account)
- Branch: main
- Deploy: GitHub Pages via Actions workflow
