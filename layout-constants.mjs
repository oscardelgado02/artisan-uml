// Shared layout knobs — the ONE source of truth for the box-size math used by
// both this editor and the artisan-uml CLI (which estimates node sizes before
// rendering and ships an embedded copy of this editor).
//
// If you change these, the editor and CLI disagree about box geometry. Bump
// CONTRACT_VERSION and update "editorContract" in the artisan-uml package.json
// in the same release. JSON shape changes also bump CONTRACT_VERSION (major).
export const CHAR_PX = 7.4; // JetBrains Mono 12px ≈ 7.4 px/char (CLI estimate)
export const NODE_MAX_PX = 640; // .node max-width cap in style.css
export const NODE_MIN_PX = 220; // widthOf lower bound
export const ROW_PAD = 48; // node box horizontal padding
export const NOTE_GLYPH = 14; // note indicator glyph width
export const NAME_CAP = 240; // name never wraps wider than this
export const NAME_FLOOR = 120; // ...nor gets squeezed below this
export const PARAMS_CAP = 240; // method params wrap budget cap
export const PARAMS_FLOOR = 80; // ...nor below this

// Schema + layout contract between the editor package and the CLI.
export const CONTRACT_VERSION = 2;
