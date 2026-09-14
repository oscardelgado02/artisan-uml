# Contributing to Artisan UML

Thanks for helping out! This project keeps contributions simple.

## Getting started

```bash
pnpm install   # Node.js 18+ and pnpm (npm works too)
pnpm dev       # dev server with hot reload
pnpm test      # layout + CSS contract checks
pnpm build     # typecheck + production build
```

## Ground rules

- **One PR per feature/fix.** Keep diffs focused; no drive-by refactors.
- **Tests must pass**: `pnpm test` and the typecheck inside `pnpm build`.
  If you touch `layout-constants.mjs` or the diagram JSON shape, bump
  `CONTRACT_VERSION` — the tests enforce consistency between the layout
  engine and the CSS.
- **No new dependencies for what the browser or stdlib already does.**
  The app is deliberately framework-free; keep it that way.
- **Match the existing code style** — strict TypeScript, no comments unless
  something genuinely needs explaining.

## Reporting issues

Open a GitHub issue with steps to reproduce, expected vs actual behavior,
and your browser/OS. Security issues: see [SECURITY.md](SECURITY.md).

## Code of conduct

Everyone is expected to follow the
[Code of Conduct](CODE_OF_CONDUCT.md).
