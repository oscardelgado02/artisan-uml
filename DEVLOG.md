# Devlog

## 20.09.2026
- Save-warning card in the editor: a static card at the right-center of the screen says `diagram.html` is mainly for viewing and points to `artisan serve` (localhost:4173) as the best-experience path. Styled with the editor's card tokens (theme-aware), no close button, no localStorage — it reappears on every open. Gated to the embedded `diagram.html` only (same `embedded && !server` check as the Connect-file button); the served and plain editors never show it.
- Served editor now picks up external diagram changes: the 5s poll also re-reads `/api/diagram`, diffs it against the last version the editor saw, reloads and highlights anything new (classes, members, relations) amber — so `artisan add`/`edit`/`remove` from the terminal show up live. Own saves don't self-trigger (disk baseline refreshed after each PUT).
- Real fix for missing amber in serve mode: `GET /api/pending` returns a bare array but the editor read `data.refs` off it — every poll replaced pending refs with `[]`. The reader now accepts both shapes. (Embedded `diagram.html` never hit this; its refs come from the `__ARTISAN__` payload.)
- Pending refs from terminal edits are recorded CLI-side (see artisan-uml-cli), so highlights survive a page reload and clear with the "Mark AI changes seen" button.

## 17.09.2026
- Default seed cleaned up: the `Mood` enum is gone and Owner now owns `IPet` instead of Dog — the starter diagram matches what the petshop code actually says (5 types, 4 relations).
- Social preview card (`assets/social-card-editor.html`): 1280×640 editor window — real Artisan UML wordmark over a dark canvas with the seed diagram, relation shapes matching the editor exactly.

## 14.09.2026
- Selected relations highlight in a theme-matching cyan/gold instead of the border accent.
- "Color links" rebuilt: lines and arrows share one per-palette token (blue family) — arrows no longer go orange, lines no longer clone the class-border color.
- Selection ring: animated gradient is now masked to the border only, so it no longer floods the whole class box.
- Rename input: width frozen to the name's layout size (zoom-immune, `offsetWidth`) — box no longer grows while typing at any zoom.
- New interaction model: clicking a class body selects it (drag just moves, ring shows during drag and reverts if it wasn't selected). Clicking name/attributes/methods edits them — but only on an already-selected class. Add-attribute/add-method buttons always work.

## 12.09.2026
- Theme selector: three palettes (Default warm brass, Developer violet neon, Artisan parchment & ink with serif class names), each with light/dark. Palette pick persisted alongside the dark-mode toggle; members stay monospace in every theme so layout measurements hold.
- Full ownership of the layout engine: wrote our own layered layout (`layout.mjs` in the editor package) — longest-path ranking, barycenter ordering, band placement. Deleted both vendored dagre copies; editor bundle 95 → 48 kB.
- Contract guard: shared box-size knobs live in `layout-constants.mjs` with a `CONTRACT_VERSION` checked by tests.
- Editor contract test suite (`test/contract.mjs`).

## 11.09.2026
- Tidy button: re-run layout inside the editor using real measured box sizes.
- Params wrap like names (shared leftover-space budget); type/vis/mods stay locked on one line.
- Git history purge: removed accidentally committed `tmp-output/` from `improved-ui` (rebuilt history, force-pushed).
- Wider member-editor popover (440px), name field flexed up; type input widened too.
- Arrow fix: detoured elbow edges now end with a stub into the box side instead of pointing parallel to it.
- Line-style dropdown: straight / rectangular / smooth / curves, persisted per diagram.
- Curves: fewest-bend routing (straight → L → Z, box-collision checked), Catmull-Rom spline with clamped handles (no end loops).
- Smooth = rectangular waypoints with axis-snapped runs and rounded bends only.
- Tidy no longer stores layout polylines; all edges render live and dodge nearby classes.
- Parallel edges get axis-safe lane offsets (stem slides sideways, bends stay 90°).
- Curve labels sit at the true midpoint of the route, not near the target class.

## 10.09.2026
- Layout rewritten with vendored dagre (Mermaid's engine): inheritance top-down, routed edge polylines.
- Bigger nodesep/ranksep; name-only text wrapping (locked vis/mods/type stay one line).
- Long names wrap deterministically (canvas-measured); overlap resolver pushes apart boxes that still touch.
- Tests grown to 33: width/height mirror CSS, zero-overlap layout on messy graph, CSS contract.

## 09.09.2026
- Self-contained `diagram.html`: editor inlined, opens by double-click, no server needed.
- "Connect file" autosaves editor edits back to `diagram.json` (File System Access API).
- All 6 UML relations detected: inheritance, realization, composition, aggregation, association, dependency.
- Layered auto-layout; rescan keeps human positions/notes.

## 08.09.2026
- Editor (vanilla TS + Vite): class diagrams with drag, undo/redo, notes on classes/members/edges/project, dark theme.
- Repo scaffolding: MIT license, FUNDING, README, install.sh, self-tests (30 checks).
