# Changelog

## 1.3.0 — 15.11.2026

### Added
- Toolbar search box: live filter/highlight over nodes, member rows (attributes/methods), node `dir` fields, relation labels/notes and notes — case-insensitive substring, space-separated tokens AND-ed. Non-matching nodes and relations dim (still clickable/editable); matching member rows highlight per-row, a member match keeps its node un-dimmed, a relation match un-dims its endpoints; removed-item tombstones participate like normal items.
- `N of M` counter with ↑/↓ buttons (hidden while the box is empty): each matchable element is a cycle stop with wrap-around, pan-to-stop and a pulse ring on the current hit. `Enter`/`Shift+Enter` step through matches.
- Shortcuts: `/` or `Ctrl/Cmd+F` focuses the box, `Esc` clears it. The filter is pure UI state — never saved to `diagram.json`.
- New lime `--search-match` palette token, kept distinct from the amber used for unreviewed AI changes; defined for light and dark default themes and inherited by the palette variants.
- Class directory targeting for `artuml scaffold` (contract unchanged at 2): right-click **Set directory…** next to **Edit note…** sets/clears the per-node `dir` (the folder where the CLI creates/moves the class file, now stored *relative to the default dir* — the CLI's `scaffoldDir` config, else its `--src` root); a **Dir** toolbar button edits the global `scaffoldDir` config (the ROOT all files live under, e.g. `src`).
- Both controls appear in the embedded editor (`window.__ARTISAN__` present) and the served editor (gated on a live `/api` server after boot); the static web editor is unaffected, the `file://` embedded editor shows the button disabled.
- The **Dir** button edits `scaffoldDir` live through the CLI's `GET/PUT /api/config`; per-node dirs persist through the served editor's normal `PUT /api/diagram` save.
- `UmlNode.dir?: string` in the model; unknown node fields already survived serialization, so the CLI round-trips `dir` untouched.
- Custom-directory badge: a node with a `dir` shows a small folder icon in the head's top-right corner, styled exactly like the note glyph (same `--mod-purple` color and size, inline SVG so it ignores platform emoji fonts) with the directory as hover title; a note glyph shifts left so both coexist. No serialization change (contract stays 2).

### Fixed
- The served editor no longer flags the human's **own** edits as unreviewed "AI changes": out-of-order responses (a 5s poll GET racing the autosave PUT, or an older PUT response landing late) could regress the editor's last-disk baseline, making the next poll see the editor's own additions as external changes — amber highlights + toast + permanently queued refs until acked, and a stale `If-Match` (409 → stale-tab reload) as a worse sibling. Disk snapshots are now rev-guarded: only a strictly newer `X-Artisan-Rev` is diffed, snapshots never regress (`src/disk-watch/`, contract unchanged at 2).

## 1.2.2 — 20.10.2026

### Fixed
- The published package ships the built editor again. `dist/` is gitignored, so the 1.2.1 tarball was packed from an unbuilt checkout and npm silently dropped `dist/`: every `artisan-uml-cli` install ended up without an editor (`artuml scan` skipped `diagram.html`, `artuml editor`/`serve` failed). `prepack` now builds the editor before packing and `postpack` fails the publish when `dist/index.html` is missing from the tarball.

## 1.2.1 — 12.10.2026

### Changed
- Copy updates: UI texts and docs now reference the CLI binary by its new name `artuml` (impl-diff badge, save-warning card, README commands). Internal event names and the `artisan` theme id are unchanged.

## 1.2.0 — 11.10.2026

### Added
- **"Code out of sync" badge** next to the ack/reject buttons: shows while the code differs from the diagram (`artisan impl-diff` result), hover explains the counts and the fix (`artisan impl-diff` → `/artisan-implement`).
- Embedded mode reads the badge state from the `__ARTISAN__` payload; server mode fetches `GET /api/impl` every 30s.
- Amber-outline styling matches the review buttons row.

## 1.1.0 — 20.09.2026

### Added
- Save-warning card in the embedded `diagram.html`: points to `artisan serve` for real autosave; static, theme-aware, shown only in the embedded editor.
- Pending-change highlights for the served editor: 5s poll re-reads `/api/diagram`, highlights new/changed items amber — terminal edits show up live.
- Tombstones for removals: pending `removed` refs render as dashed amber struck-through boxes (classes with member lists, member rows, relations as dashed amber lines). Draggable, positions survive the poll, skip themselves if the item comes back.
- Per-item review: ✓ / ✕ chips on every amber item (HTML for nodes/members, SVG for relations) plus global **Mark AI changes seen** / **Reject AI changes** buttons. ✕ reverts the diagram (per-ref ghost reverts; full reject reverts only what is still pending).
- Disk-first saving: revision guard on `PUT /api/diagram` (`If-Match` / 409) — a stale tab can no longer clobber newer disk state; it reloads disk instead.
- `POST /api/pending {refs}`: editor-detected changes persist as refs, so highlights and tombstones survive a page reload.

### Fixed
- `GET /api/pending` shape mismatch wiped amber highlights every poll tick (bare array vs `{refs}`).
- Stale-tab saves are rejected by the server (rev mismatch) instead of overwriting newer disk state.
- Tombstone relations re-anchor while dragging the tombstone, not only on mouseup.
