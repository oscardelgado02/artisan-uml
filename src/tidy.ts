// Tidy: re-layout the whole diagram with Artisan's own layered engine
// (../layout.mjs — same algorithm `artisan scan` uses), fed the editor's REAL
// measured box sizes. No stored polylines: edges are drawn live by the current
// line style (curves dodge nearby classes at render time).
import { layeredLayout } from '../layout.mjs';
import { state } from './model';
import { renderAll } from './render';
import { save } from './storage';

export function tidyAll(): void {
  if (!state.nodes.length) return;
  const sized = state.nodes.map((n) => ({ ...n, width: n._w ?? 220, height: n._h ?? 100 }));
  layeredLayout(sized, state.edges);
  const placed = new Map(sized.map((n) => [n.id, n]));
  for (const n of state.nodes) {
    const p = placed.get(n.id);
    if (p) {
      n.x = p.x;
      n.y = p.y;
    }
  }
  renderAll();
  save();
}
