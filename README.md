# artisan-uml-editor

A fast, fluid UML **class diagram editor** for the web. Classic diagram tools are
**drag-and-drop**: you drag boxes around, resize them, and wrestle text inside rectangles.
Here the canvas is not a drawing surface — it is a live document. You **click a `+` to add
attributes and methods**, edit everything **in place** (inline, like a text field), and link
types with proper UML relations. Layout stays tidy automatically; you spend your time
modeling, not moving rectangles.

Built with **Node + Vite + TypeScript + CSS** (no framework). Published as the npm package
`artisan-uml-editor`.

![Tech](https://img.shields.io/badge/TypeScript-strict-blue) ![Build](https://img.shields.io/badge/Vite-6-purple)

## Quick start

Requires [Node.js](https://nodejs.org) 18+ and [pnpm](https://pnpm.io) (or npm).

```bash
pnpm install     # install dependencies
pnpm dev         # start dev server with hot reload
pnpm build       # typecheck + production build into dist/
pnpm test        # package contract: constants + CSS rules the CLI mirrors
pnpm preview     # serve the production build
```

### Contract with the CLI

`layout-constants.mjs` is the single source of truth for box-size math (character width,
node cap, wrap budgets). The CLI estimates node sizes from the same numbers, and its
`package.json` pins an `editorContract` version. If you change the constants or the diagram
JSON shape, bump `CONTRACT_VERSION` here and the matching `editorContract` in
`artisan-uml` — a mismatch fails loudly on `artisan scan` instead of silently corrupting
layout. `pnpm test` checks the CSS against the constants.

## Features

### Nodes

- **Kinds**: class, abstract class, interface, enum, record, struct
  (stereotypes like `«interface»` / `«enum»` are shown on the header).
- **Kind-appropriate members** — interfaces show **properties + methods**,
  enums show **values** only (`Name = 1`, value optional), everything else has
  attributes + methods.
- **Add members in one click** — every box has `+ attribute` / `+ method` /
  `+ value` buttons, or right-click a box → *Add attribute / method / value*.
- **Inline editing** — click the class name (or right-click → *Rename*) to edit it in place.
  Double-click the empty canvas to instantly create a new class and start naming it.
- **Member editor popover** — click any member row to edit:
  - **Visibility**: `+` public, `-` private, `#` protected, `~` internal
    (also settable via right-click on the row, or by clicking through the menu)
  - **Name**, **type** (attribute) or **return type** (method)
  - **Parameters**, e.g. `dx: int, dy: int`
  - **Modifier chips**: `static`, `abstract`, `readonly`, `virtual`, `override`,
    `sealed`, `async`, `const`
- **Syntax coloring**: names use the inverse-of-background color, visibility is
  **orange**, types are **cyan**, modifiers are **purple** (theme-aware).

### Relations

Three ways to create one:

1. **Drag a node's border** (the outer ~8 px ring, crosshair cursor) onto another
   node — a menu pops up to pick the relation kind. Drop it on the same node for
   a **self-relation** (e.g. a singleton).
2. **Right-drag** from a node to a node — same menu on drop.
3. Pick a relation in the toolbar, then click the **source** node and the
   **target** node (`Esc` or a click on empty canvas cancels).

| Relation | Notation |
| --- | --- |
| Inheritance (extends) | solid line + hollow triangle |
| Realization (implements) | dashed line + hollow triangle |
| Composition (owns) | filled diamond at the owner |
| Aggregation (has-a) | hollow diamond at the owner |
| Association | solid line + open arrow |
| Dependency | dashed line + open arrow |

Self-relations render as a small loop on the right side of the node.

Click any relation to edit its **type, label and multiplicities** (`1`, `0..*`, …),
reverse it, or delete it. Toggle **Color links** in the toolbar to paint all
relations in the accent color so they stand out from the class boxes.

### Editor niceties

- **Light / dark theme** (follows your system preference, toggle in the toolbar)
- **Undo / redo** — `Ctrl+Z` / `Ctrl+Shift+Z`
- **Autosave** to `localStorage`
- **Pan** by dragging the canvas (or middle mouse), **zoom** with `Ctrl+scroll`
  or pinch, zoom widget bottom-right, fit-view button
- **Delete** key removes the selected node/relation

### Import / export

- **Export / Import JSON** — full-fidelity diagram files (Import has its own
  toolbar button, and also lives in the Export menu)
- **PlantUML** — copy or download your diagram as `.puml` text

## Project structure

```
editor/
├── index.html             entry page (theme boot script + toolbar/canvas markup)
├── layout-constants.mjs   shared box-size knobs + CONTRACT_VERSION (CLI mirrors these)
├── layout.mjs             our own layered auto-layout engine (used by Tidy + CLI scan)
├── package.json           published npm package: ships dist/ + layout-constants
├── test/contract.mjs      package contract test (constants, layout, CSS rules)
├── tsconfig.json          strict TypeScript config
└── src/
    ├── main.ts            event wiring, toolbar, boot
    ├── model.ts           domain types + constants (node kinds, relations, visibility)
    ├── render.ts          node/edge rendering, pan & zoom camera
    ├── storage.ts         localStorage persistence + undo/redo history
    ├── editors.ts         context menus, member/relation popovers, inline rename
    ├── exporters.ts       JSON + PlantUML export/import
    ├── tidy.ts            re-layout via our layered engine ("Tidy" button)
    ├── types.ts           shared UI types
    └── style.css          theme variables (light/dark) + all styling
```

## Data model

```ts
interface Member {
  id: string;
  vis: '+' | '-' | '#' | '~';
  name: string;
  type: string;          // attribute type / method return type
  mods: string[];        // static, abstract, readonly, ...
  params: string | null; // method parameters, e.g. "dx: int, dy: int"
}

interface UmlNode {
  id: string;
  kind: 'class' | 'abstract' | 'interface' | 'enum' | 'record' | 'struct';
  name: string;
  x: number; y: number;
  attributes: Member[];
  methods: Member[];
}

interface UmlEdge {
  id: string;
  kind: 'association' | 'inheritance' | 'realization' | 'dependency'
      | 'aggregation' | 'composition';
  from: string; to: string;   // node ids
  label: string;
  fromMult: string; toMult: string;
}
```

## Theming

All colors live as CSS custom properties in `src/style.css`, mirroring the light/dark
split (`html` vs `html.dark`) used by the cards the design is based on:

| Token | Used for |
| --- | --- |
| `--card-bg`, `--card-border`, `--card-shadow` | class box cards |
| `--primary-from` / `--primary-to`, `--accent-glow` | accent, selected-box animated border, relation highlight |
| `--vis-orange`, `--type-cyan`, `--mod-purple` | member syntax coloring |
| `--edge-default` / `--edge-c` | relation strokes (default vs "Color links") |

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |
| `Delete` / `Backspace` | Delete selection |
| `Esc` | Close menus / cancel linking / deselect |
| Double-click canvas | New class |
| Right-click | Context menus everywhere |
