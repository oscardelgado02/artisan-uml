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

## Get it from npm

The easiest way to run the editor. It ships as the npm package
[`artisan-uml`](https://www.npmjs.com/package/artisan-uml), no cloning needed:

```bash
pnpm add artisan-uml
pnpm dlx serve node_modules/artisan-uml/dist
```

Open the printed URL and you are modeling. (npm equivalents: `npm install artisan-uml`
and `npx serve node_modules/artisan-uml/dist`.) Inside the package you also get:

- `dist/`, the production build of the editor, ready to serve as static files
- `layout-constants.mjs`, the shared size constants the editor uses
  (`NODE_MAX_PX`, `CHAR_PX`, wrap budgets, and friends)
- `layout.mjs`, the `layeredLayout(nodes, edges, opts)` function that keeps
  parents above children with no overlaps. You can reuse both in your own
  diagramming tools:

```js
import { NODE_MAX_PX } from 'artisan-uml/layout-constants.mjs';
import { layeredLayout } from 'artisan-uml/layout.mjs';
```

## Clone the project

Prefer to run it from source? Clone the repository and install:

```bash
git clone https://github.com/oscardelgado02/artisan-uml
cd artisan-uml
pnpm install
pnpm dev       # dev server with hot reload
```

Other scripts: `pnpm build` (production build into `dist/`) and `pnpm test`
(layout + CSS contract checks). This repo uses pnpm, but npm works too if that
is what you have installed.

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
