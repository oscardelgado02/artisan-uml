# Themes

## Built-in palettes

Four palettes, each with a light and dark mode:

| Palette | Look |
| --- | --- |
| **Default** | warm brass on warm paper |
| **Developer** | violet neon on near-black |
| **Artisan** | parchment & ink, serif class names |
| **Navy** | deep sea with gold highlights |

Pick one from the **Theme** dropdown in the toolbar. Light/dark follows your
system preference by default; the sun/moon button next to it overrides.

## How theming works

All colors live as CSS custom properties in `src/style.css`. Each palette is a
set of variable values scoped to `html[data-theme="…"]` (light) and
`html.dark[data-theme="…"]` (dark).

| Token | Used for |
| --- | --- |
| `--card-bg`, `--card-border`, `--card-shadow` | class box cards |
| `--primary-from` / `--primary-to`, `--accent-glow` | accent, selected-box animated border |
| `--vis-orange`, `--type-cyan`, `--mod-purple` | member syntax coloring |
| `--edge-default` / `--edge-colorize` | relation strokes (default vs "Color links") |
| `--edge-selected` | selected-relation highlight |

## Adding a palette

1. Add two CSS blocks in `src/style.css`: `html[data-theme="yourname"]` and
   `html.dark[data-theme="yourname"]`, defining the same token set.
2. Add an `<option value="yourname">` to the `#sel-palette` dropdown in
   `index.html`.
3. Add the name to the allowlist in the theme boot script in `index.html`
   (so the palette is applied before first paint).

Members stay monospace in every theme — the layout engine measures mono
character width, so serif fonts are only allowed on headers and class names
(see the Artisan palette for the pattern).
