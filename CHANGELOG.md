# Changelog

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
