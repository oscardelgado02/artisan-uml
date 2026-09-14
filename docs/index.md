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

## Why I built this

I'm [Óscar Delgado](https://oscardelgado.dev), a software engineer. Before starting a
project, or when adding a new feature, I like to plan the architecture first. The
tools for that moment never felt right: most UML editors are slow and clunky, and the
bigger and more complex your system gets, the less nice it feels to keep the diagram
up to date.

Artisan UML is my answer to that: designing software should feel as fluid as writing
code. Click a `+`, type, link, done, and the layout takes care of itself. You spend your
energy on the architecture, not on the tool.

I released it as open source so that as many people as possible can use it, and
hopefully it can help a lot of developers. If it makes planning your next project
nicer, it was worth building.
