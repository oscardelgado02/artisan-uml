# Artisan UML

A fast, fluid UML **class diagram editor** for the web. The canvas is not a
drawing surface — it is a live document. You **click a `+` to add attributes and
methods**, edit everything **in place**, and link types with proper UML
relations. Layout stays tidy automatically; you spend your time modeling, not
moving rectangles.

Built with Node + Vite + TypeScript + CSS (no framework).

## Pages

- [**Editing**](editing.md) — creating classes, inline editing, selection
- [**Relations**](relations.md) — the six UML relation types and how to draw them
- [**Themes**](themes.md) — palettes, light/dark mode, custom tokens
- [**Keyboard reference**](keyboard.md) — every shortcut
- [**Data model**](data-model.md) — the diagram JSON format

## Run it yourself

```bash
pnpm install
pnpm dev       # dev server with hot reload
pnpm build     # production build into dist/
pnpm test      # layout + CSS contract checks
```

## Where your data lives

- Diagrams autosave to your browser's `localStorage` — nothing is uploaded
  anywhere.
- **Export JSON** downloads a full-fidelity `uml-diagram.json` file.
- **Connect file** (Chrome/Edge) autosaves edits directly to a
  `diagram.json` on your disk.
