# npm package

The easiest way to run Artisan UML. It ships as the npm package
[`artisan-uml`](https://www.npmjs.com/package/artisan-uml): install it with
pnpm and serve the built editor, no cloning and no build step.

```bash
pnpm add artisan-uml
pnpm dlx serve node_modules/artisan-uml/dist
```

That is the whole editor: the app runs fully in the browser and stores diagrams
in `localStorage`, so there is no backend to configure.

**npm equivalents**: every pnpm command above has an npm one. `pnpm add artisan-uml`
is `npm install artisan-uml`, and `pnpm dlx serve ...` is `npx serve ...`.

## What is inside

| Path | What it is |
| --- | --- |
| `dist/` | The production build of the editor, ready to serve as static files |
| `layout-constants.mjs` | Shared size constants (`NODE_MAX_PX`, `CHAR_PX`, wrap budgets) |
| `layout-constants.d.mts` | TypeScript types for the constants |
| `layout.mjs` | The `layeredLayout` function used by the editor's Tidy button |
| `layout.d.mts` | TypeScript types for the layout function |

The package `exports` map exposes each path directly:

```js
import { NODE_MAX_PX } from 'artisan-uml/layout-constants.mjs';
import { layeredLayout } from 'artisan-uml/layout.mjs';
```

## Serve the editor yourself

Copy `node_modules/artisan-uml/dist` anywhere a static file server can reach:

```bash
pnpm dlx serve node_modules/artisan-uml/dist
```

That is the whole editor: the app runs fully in the browser and stores diagrams
in `localStorage`, so there is no backend to configure.

## Reuse the layout engine

`layeredLayout(nodes, edges, opts)` positions nodes so parents sit above their
children with no overlaps. The editor calls it for the `Tidy` button and on
startup, but the function is dependency-free and works with your own node and
edge shapes. Check `layout-constants.d.mts` for the exact expected shape of
nodes and edges.

## Versions

New releases are published as patch/minor/major bumps on npm. Check the
[npm versions page](https://www.npmjs.com/package/artisan-uml?activeTab=versions)
or run `pnpm view artisan-uml versions` to see what is available.
