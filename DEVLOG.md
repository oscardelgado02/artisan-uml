# Devlog

## 12.09.2026
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
