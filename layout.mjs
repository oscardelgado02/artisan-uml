// Artisan's own layered layout — no dagre, no black box. Owned, tuned by us.
//
// Three phases, classic Sugiyama-lite:
//   1. Rank: longest-path layering from the roots (cycle-guarded DFS). Parents
//      rank above children: inheritance/realization put the BASE above
//      (edge parent = e.to); every other relation puts the SOURCE above.
//   2. Order: barycenter sweeps within each rank to reduce edge crossings
//      (strong relations — inheritance/realization/composition — weigh 3).
//   3. Place: each rank is a horizontal band; nodes go left→right with
//      `nodesep` gaps, bands stack with `ranksep`. Ranks centered on the
//      widest band. Overlap is impossible by construction.
//
// Nodes need {id, width, height}; edges {from, to, kind?}. Mutates x/y
// (top-left corner, same convention as the diagram JSON).

export const DEFAULT_NODES = 110;
export const DEFAULT_RANKSEP = 120;

const isHierarchy = (e) => e.kind === 'inheritance' || e.kind === 'realization';
const isStrong = (e) => isHierarchy(e) || e.kind === 'composition';

export function layeredLayout(nodes, edges, opts = {}) {
  if (!nodes.length) return;
  const nodesep = opts.nodesep ?? DEFAULT_NODES;
  const ranksep = opts.ranksep ?? DEFAULT_RANKSEP;

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const E = (edges || []).filter((e) => byId.has(e.from) && byId.has(e.to) && e.from !== e.to);

  // --- 1. rank ------------------------------------------------------------
  const parents = new Map(nodes.map((n) => [n.id, []]));
  for (const e of E) {
    const p = isHierarchy(e) ? e.to : e.from;
    const c = isHierarchy(e) ? e.from : e.to;
    parents.get(c).push(p);
  }
  const layer = new Map();
  const active = new Set();
  const lay = (id) => {
    if (layer.has(id)) return layer.get(id);
    if (active.has(id)) return 0; // cycle: ignore the back edge, keep going
    active.add(id);
    let L = 0;
    for (const p of parents.get(id)) L = Math.max(L, lay(p) + 1);
    active.delete(id);
    layer.set(id, L);
    return L;
  };
  for (const n of nodes) lay(n.id);

  const maxLayer = Math.max(...layer.values());
  const ranks = Array.from({ length: maxLayer + 1 }, () => []);
  for (const n of nodes) ranks[layer.get(n.id)].push(n);
  // Cycles can leave gaps in the layer sequence — drop empty ranks (they
  // would produce NaN band heights) and re-sync order indices.
  const dense = ranks.filter((r) => r.length);
  // --- 2. order (barycenter sweeps) ---------------------------------------
  const nbrs = new Map(nodes.map((n) => [n.id, []]));
  for (const e of E) {
    const w = isStrong(e) ? 3 : 1;
    nbrs.get(e.from).push({ id: e.to, w });
    nbrs.get(e.to).push({ id: e.from, w });
  }
  const order = new Map();
  const sync = (rank, ri) => rank.forEach((n, i) => order.set(n.id, { r: ri, i }));
  dense.forEach(sync); // re-synced after dropping empty ranks
  const bary = (n, other) => {
    let sum = 0;
    let wsum = 0;
    for (const { id, w } of nbrs.get(n.id)) {
      const o = order.get(id);
      if (o.r === other) {
        sum += o.i * w;
        wsum += w;
      }
    }
    return wsum ? sum / wsum : order.get(n.id).i; // no neighbors → keep place
  };
  for (let pass = 0; pass < 4; pass++) {
    const seq = Array.from({ length: dense.length }, (_, i) => i);
    if (pass % 2) seq.reverse();
    for (const ri of seq) {
      dense[ri].sort(
        (a, b) => bary(a, ri - 1) - bary(b, ri - 1) || bary(a, ri + 1) - bary(b, ri + 1) || (a.name < b.name ? -1 : 1)
      );
      sync(dense[ri], ri);
    }
  }

  // --- 3. place ------------------------------------------------------------
  const margin = 40;
  const width = (ri) =>
    dense[ri].reduce((s, n) => s + n.width, 0) + nodesep * Math.max(0, dense[ri].length - 1);
  const maxW = Math.max(...dense.map((_, ri) => width(ri)));
  let y = margin;
  for (const rank of dense) {
    const bandH = Math.max(...rank.map((n) => n.height));
    let x = margin + (maxW - width(dense.indexOf(rank))) / 2;
    for (const n of rank) {
      n.x = Math.round(x);
      n.y = Math.round(y + (bandH - n.height) / 2);
      x += n.width + nodesep;
    }
    y += bandH + ranksep;
  }
}
