import {
  EDGE_KINDS,
  KINDS,
  SVG_NS,
  clamp,
  esc,
  isPending,
  nodeById,
  selEdge,
  selNode,
  state,
} from './model';
import type { Member, MemberSection, UmlNode } from './model';

const wrap = document.getElementById('canvas-wrap') as HTMLDivElement;
const viewport = document.getElementById('viewport') as HTMLDivElement;
const nodesLayer = document.getElementById('nodes') as HTMLDivElement;
const edgesSvg = document.querySelector<SVGSVGElement>('#edges') as SVGSVGElement;
const edgePaths = document.querySelector<SVGGElement>('#edge-paths') as SVGGElement;
const zoomLabel = document.getElementById('zoom-label') as HTMLSpanElement;
const btnColorize = document.getElementById('btn-colorize') as HTMLButtonElement;

export { wrap, nodesLayer };

// Deterministic member-name wrapping: measure with canvas so long names break
// into lines here instead of trusting flex quirks. The name's budget shrinks
// when the locked parts (vis/mods/type/params) are long, so the whole row
// always fits the node cap — only the name ever wraps. Knobs come from
// layout-constants.mjs, shared with the CLI (see that file for the contract).
import {
  NAME_CAP,
  NAME_FLOOR,
  NODE_MAX_PX,
  NOTE_GLYPH,
  PARAMS_CAP,
  PARAMS_FLOOR,
  ROW_PAD,
} from '../layout-constants.mjs';
let measureCtx: CanvasRenderingContext2D | null = null;
function measureCtxOf(): CanvasRenderingContext2D | null {
  if (measureCtx !== null) return measureCtx;
  const c = document.createElement('canvas');
  measureCtx = c.getContext('2d');
  return measureCtx;
}

function lockedText(m: Member, isEnum: boolean): string {
  if (isEnum) return m.type ? ' = ' + m.type : '';
  let s = '';
  if (m.mods.length) s += m.mods.join(' ') + ' ';
  if (m.vis) s += m.vis + ' ';
  s += ' ';
  if (m.type) s += ': ' + m.type;
  return s;
}

export function wrapName(name: string, budgetPx = NAME_CAP): string {
  if (!name) return name;
  if (name.length < 34 && budgetPx >= NAME_CAP) return name;
  const ctx = measureCtxOf();
  if (!ctx) return name;
  ctx.font = '12px "JetBrains Mono", monospace';
  const px = (s: string) => ctx.measureText(s).width;
  const lines: string[] = [];
  let cur = '';
  for (let word of name.split(' ')) {
    while (px(word) > budgetPx) {
      let i = word.length;
      while (i > 1 && px(word.slice(0, i)) > budgetPx) i--;
      lines.push((cur ? cur + ' ' : '') + word.slice(0, i));
      cur = '';
      word = word.slice(i);
    }
    const cand = cur ? cur + ' ' + word : word;
    if (px(cand) > budgetPx && cur) {
      lines.push(cur);
      cur = word;
    } else cur = cand;
  }
  if (cur) lines.push(cur);
  return lines.join('\n');
}

// Per-row wrap budgets: name and params may both break into lines; they share
// the space left by the locked parts (mods/vis/type + node padding).
// Per-row wrap budgets: name and params may both break into lines; they share
// the space left by the locked parts (mods/vis/type + node padding). Name
// takes the leftover first; params get the rest. Mirrors rowParts() in the
// CLI's diagram.mjs — same knobs, from layout-constants.mjs.
export function rowBudgets(m: Member, isMethod: boolean, isEnum: boolean): { nameBudget: number; paramsBudget: number } {
  const ctx = measureCtxOf();
  if (!ctx) return { nameBudget: NAME_CAP, paramsBudget: PARAMS_CAP };
  ctx.font = '12px "JetBrains Mono", monospace';
  const lockedPx = ctx.measureText(lockedText(m, isEnum)).width;
  const remaining = NODE_MAX_PX - ROW_PAD - (m.note ? NOTE_GLYPH : 0) - lockedPx;
  const nameBudget = Math.min(NAME_CAP, Math.max(NAME_FLOOR, remaining));
  const used = Math.min(ctx.measureText(m.name ?? '').width, nameBudget);
  const paramsBudget = isMethod ? Math.min(PARAMS_CAP, Math.max(PARAMS_FLOOR, remaining - used)) : PARAMS_CAP;
  return { nameBudget, paramsBudget };
}

export function svgEl(tag: string): SVGElement {
  return document.createElementNS(SVG_NS, tag);
}

export function applyCam(): void {
  viewport.style.transform = `translate(${state.cam.x}px, ${state.cam.y}px) scale(${state.cam.z})`;
  wrap.style.backgroundPosition = `${state.cam.x}px ${state.cam.y}px`;
  wrap.style.backgroundSize = `${26 * state.cam.z}px ${26 * state.cam.z}px`;
  zoomLabel.textContent = Math.round(state.cam.z * 100) + '%';
}

export function zoomAt(clientX: number, clientY: number, factor: number): void {
  const r = wrap.getBoundingClientRect();
  const mx = clientX - r.left;
  const my = clientY - r.top;
  const z2 = clamp(state.cam.z * factor, 0.2, 3);
  const k = z2 / state.cam.z;
  state.cam.x = mx - k * (mx - state.cam.x);
  state.cam.y = my - k * (my - state.cam.y);
  state.cam.z = z2;
  applyCam();
}

export function toCanvas(cx: number, cy: number): { x: number; y: number } {
  const r = wrap.getBoundingClientRect();
  return {
    x: (cx - r.left - state.cam.x) / state.cam.z,
    y: (cy - r.top - state.cam.y) / state.cam.z,
  };
}

export function viewCenter(): { x: number; y: number } {
  const r = wrap.getBoundingClientRect();
  return toCanvas(r.left + r.width / 2, r.top + r.height / 2);
}

export function fitView(): void {
  if (!state.nodes.length) {
    state.cam = { x: 80, y: 40, z: 1 };
    applyCam();
    return;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of state.nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + (n._w ?? 220));
    maxY = Math.max(maxY, n.y + (n._h ?? 100));
  }
  const r = wrap.getBoundingClientRect();
  const pad = 70;
  const z = clamp(
    Math.min((r.width - pad * 2) / (maxX - minX), (r.height - pad * 2) / (maxY - minY)),
    0.2,
    1.5
  );
  state.cam.z = z;
  state.cam.x = r.width / 2 - ((minX + maxX) / 2) * z;
  state.cam.y = r.height / 2 - ((minY + maxY) / 2) * z;
  applyCam();
}

export function syncColorize(): void {
  edgesSvg.classList.toggle('colorize', state.colorize);
  btnColorize.classList.toggle('is-active', state.colorize);
}

function memberRow(n: UmlNode, m: Member, key: MemberSection): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'member' + (isPending('member', m.id) ? ' ai-change' : '');
  row.dataset.mid = m.id;
  if (m.note) row.title = m.note;
  const isEnum = n.kind === 'enum';
  const b = rowBudgets(m, key === 'methods', isEnum);
  if (isEnum) {
    const name = m.name ? esc(wrapName(m.name, b.nameBudget)) : '<span class="unnamed">(unnamed)</span>';
    const val = m.type ? `<span class="m-type"> = ${esc(m.type)}</span>` : '';
    row.innerHTML = `<span class="m-name">${name}</span>${val}`;
    return row;
  }
  const mods = m.mods.length ? `<span class="m-mods">${esc(m.mods.join(' '))} </span>` : '';
  const vis = m.vis ? `<span class="m-vis">${esc(m.vis)}</span>` : '';
  const params = key === 'methods' ? `<span class="m-params">(${esc(wrapName(m.params ?? '', b.paramsBudget))})</span>` : '';
  const name = m.name ? esc(wrapName(m.name, b.nameBudget)) : '<span class="unnamed">(unnamed)</span>';
  const type = m.type ? `<span class="m-type">: ${esc(m.type)}</span>` : '';
  const note = m.note ? '<span class="note-glyph">\u270E</span>' : '';
  row.innerHTML = `${note}${mods}${vis}${vis ? ' ' : ''}<span class="m-name">${name}</span>${params}${type}`;
  return row;
}

function nodeSection(n: UmlNode, key: MemberSection, kindLabel: string): HTMLDivElement {
  const sec = document.createElement('div');
  sec.className = 'node-sec sec-' + key;
  for (const m of n[key]) sec.appendChild(memberRow(n, m, key));
  const add = document.createElement('button');
  add.className = 'add-btn';
  add.dataset.action = 'add-' + key;
  add.textContent = '+ ' + kindLabel;
  sec.appendChild(add);
  return sec;
}

export function renderNodes(): void {
  nodesLayer.textContent = '';
  for (const n of state.nodes) {
    const el = document.createElement('div');
    el.className =
      'node kind-' +
      n.kind +
      (selNode(n.id) ? ' selected' : '') +
      (state.linkFrom === n.id ? ' link-source' : '') +
      (isPending('node', n.id) ? ' ai-change' : '');
    el.dataset.id = n.id;
    el.style.left = n.x + 'px';
    el.style.top = n.y + 'px';
    if (n.note) el.title = n.note;

    const head = document.createElement('div');
    head.className = 'node-head';
    const stereo = KINDS[n.kind]?.stereo ?? '';
    head.innerHTML =
      (n.note ? '<span class="note-glyph node-note" title="' + esc(n.note) + '">\u270E</span>' : '') +
      (stereo ? `<div class="stereo">${esc(stereo)}</div>` : '') +
      `<div class="node-name" data-role="name">${
        n.name ? esc(n.name) : '<span class="unnamed">(unnamed)</span>'
      }</div>`;
    el.appendChild(head);

    if (n.kind === 'enum') {
      el.appendChild(nodeSection(n, 'attributes', 'value'));
    } else if (n.kind === 'interface') {
      el.appendChild(nodeSection(n, 'attributes', 'property'));
      el.appendChild(nodeSection(n, 'methods', 'method'));
    } else {
      el.appendChild(nodeSection(n, 'attributes', 'attribute'));
      el.appendChild(nodeSection(n, 'methods', 'method'));
    }
    nodesLayer.appendChild(el);
    n._w = el.offsetWidth;
    n._h = el.offsetHeight;
  }
}

export function anchor(a: UmlNode, b: UmlNode): { x: number; y: number } {
  const aw = a._w ?? 220;
  const ah = a._h ?? 100;
  const cx = a.x + aw / 2;
  const cy = a.y + ah / 2;
  const dx = b.x + (b._w ?? 220) / 2 - cx;
  const dy = b.y + (b._h ?? 100) / 2 - cy;
  const sx = dx ? (aw / 2 + 2) / Math.abs(dx) : Infinity;
  const sy = dy ? (ah / 2 + 2) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

export function onBorder(n: UmlNode, px: number, py: number): boolean {
  const w = n._w ?? 220;
  const h = n._h ?? 100;
  const lx = px - n.x;
  const ly = py - n.y;
  if (lx < -6 || ly < -6 || lx > w + 6 || ly > h + 6) return false;
  const m = 12;
  return lx < m || lx > w - m || ly < m || ly > h - m;
}

export function nearestBorderPoint(n: UmlNode, px: number, py: number): { x: number; y: number } {
  const w = n._w ?? 220;
  const h = n._h ?? 100;
  const x = clamp(px - n.x, 0, w);
  const y = clamp(py - n.y, 0, h);
  const dl = x;
  const dr = w - x;
  const dt = y;
  const db = h - y;
  const m = Math.min(dl, dr, dt, db);
  if (m === dl) return { x: n.x, y: n.y + y };
  if (m === dr) return { x: n.x + w, y: n.y + y };
  if (m === dt) return { x: n.x + x, y: n.y };
  return { x: n.x + x, y: n.y + h };
}

function edgeLabelText(x: number, y: number, txt: string, cls: string): SVGTextElement {
  const t = svgEl('text') as SVGTextElement;
  t.setAttribute('x', String(x));
  t.setAttribute('y', String(y));
  t.setAttribute('class', cls);
  t.setAttribute('text-anchor', 'middle');
  t.textContent = txt;
  return t;
}

// Does a straight segment pass through any node box (besides a/b)?
function segBlocked(x: number, y1: number, y2: number, skipA: string, skipB: string): boolean {
  const lo = Math.min(y1, y2);
  const hi = Math.max(y1, y2);
  for (const n of state.nodes) {
    if (n.id === skipA || n.id === skipB) continue;
    if (x > n.x + 6 && x < n.x + (n._w ?? 220) - 6 && n.y + (n._h ?? 100) > lo + 6 && n.y < hi - 6) return true;
  }
  return false;
}

function segBlockedH(y: number, x1: number, x2: number, skipA: string, skipB: string): boolean {
  const lo = Math.min(x1, x2);
  const hi = Math.max(x1, x2);
  for (const n of state.nodes) {
    if (n.id === skipA || n.id === skipB) continue;
    if (y > n.y + 6 && y < n.y + (n._h ?? 100) - 6 && n.x + (n._w ?? 220) > lo + 6 && n.x < hi - 6) return true;
  }
  return false;
}

// Nearest free vertical channel: midpoint between neighbouring node columns.
function corridorX(x1: number, x2: number, y1: number, y2: number, skipA: string, skipB: string): number {
  const bounds = new Set<number>();
  for (const n of state.nodes) {
    bounds.add(n.x);
    bounds.add(n.x + (n._w ?? 220));
  }
  const cand = [...bounds].sort((p, q) => p - q);
  const mids: number[] = [cand[0] - 60, cand[cand.length - 1] + 40];
  for (let i = 0; i < cand.length - 1; i++) mids.push((cand[i] + cand[i + 1]) / 2);
  mids.sort((p, q) => Math.abs(p - (x1 + x2) / 2) - Math.abs(q - (x1 + x2) / 2));
  for (const m of mids) if (!segBlocked(m, y1, y2, skipA, skipB)) return Math.round(m);
  return Math.round((x1 + x2) / 2);
}

function corridorY(y1: number, y2: number, x1: number, x2: number, skipA: string, skipB: string): number {
  const bounds = new Set<number>();
  for (const n of state.nodes) {
    bounds.add(n.y);
    bounds.add(n.y + (n._h ?? 100));
  }
  const cand = [...bounds].sort((p, q) => p - q);
  const mids: number[] = [cand[0] - 40, cand[cand.length - 1] + 40];
  for (let i = 0; i < cand.length - 1; i++) mids.push((cand[i] + cand[i + 1]) / 2);
  mids.sort((p, q) => Math.abs(p - (y1 + y2) / 2) - Math.abs(q - (y1 + y2) / 2));
  for (const m of mids) if (!segBlockedH(m, x1, x2, skipA, skipB)) return Math.round(m);
  return Math.round((y1 + y2) / 2);
}

type Waypoint = { x: number; y: number };

function edgeRoute(
  a: UmlNode,
  b: UmlNode
): { pts: Waypoint[]; mid: { x: number; y: number } } {
  const aw = a._w ?? 220;
  const ah = a._h ?? 100;
  const bw = b._w ?? 220;
  const bh = b._h ?? 100;
  const acx = a.x + aw / 2;
  const acy = a.y + ah / 2;
  const bcx = b.x + bw / 2;
  const bcy = b.y + bh / 2;
  const sepX = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + aw, b.x + bw));
  const sepY = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + ah, b.y + bh));
  if (sepX === 0 && sepY === 0) {
    // overlapping boxes: straight center-to-center
    return {
      pts: [{ x: acx, y: acy }, { x: bcx, y: bcy }],
      mid: { x: (acx + bcx) / 2, y: (acy + bcy) / 2 },
    };
  }
  if (sepX >= sepY) {
    const right = bcx > acx;
    const sx = right ? a.x + aw : a.x;
    const ex = right ? b.x : b.x + bw;
    const sy = acy;
    const ey = bcy;
    // detour through a free horizontal channel when the straight run is blocked
    if (segBlockedH(sy, sx, ex, a.id, b.id)) {
      const ch = corridorY(sy, ey, sx, ex, a.id, b.id);
      const m1 = right ? sx + 16 : sx - 16;
      const m2 = right ? ex - 16 : ex + 16;
      if ((right && m2 > m1) || (!right && m2 < m1)) {
        return {
          pts: [
            { x: sx, y: sy },
            { x: m1, y: sy },
            { x: m1, y: ch },
            { x: m2, y: ch },
            { x: m2, y: ey },
            { x: ex, y: ey },
          ],
          mid: { x: m2, y: ch },
        };
      }
    }
    const mx = (sx + ex) / 2;
    return {
      pts: [
        { x: sx, y: sy },
        { x: mx, y: sy },
        { x: mx, y: ey },
        { x: ex, y: ey },
      ],
      mid: { x: mx, y: (sy + ey) / 2 },
    };
  }
  const down = bcy > acy;
  const sy = down ? a.y + ah : a.y;
  const ey = down ? b.y : b.y + bh;
  const sx = acx;
  const ex = bcx;
  if (segBlocked(sx, sy, ey, a.id, b.id)) {
    const ch = corridorX(sx, ex, sy, ey, a.id, b.id);
    const m1 = down ? sy + 16 : sy - 16;
    const m2 = down ? ey - 16 : ey + 16;
    if ((down && m2 > m1) || (!down && m2 < m1)) {
      return {
        pts: [
          { x: sx, y: sy },
          { x: sx, y: m1 },
          { x: ch, y: m1 },
          { x: ch, y: m2 },
          { x: ex, y: m2 },
          { x: ex, y: ey },
        ],
        mid: { x: ch, y: (m1 + m2) / 2 },
      };
    }
  }
  const my = (sy + ey) / 2;
  return {
    pts: [
      { x: sx, y: sy },
      { x: sx, y: my },
      { x: ex, y: my },
      { x: ex, y: ey },
    ],
    mid: { x: (sx + ex) / 2, y: my },
  };
}

const dir = (ax: number, ay: number, bx: number, by: number) => {
  const l = Math.hypot(bx - ax, by - ay) || 1;
  return { x: (bx - ax) / l, y: (by - ay) / l };
};

function segIntersect(p1: Waypoint, p2: Waypoint, p3: Waypoint, p4: Waypoint): boolean {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (!d) return false;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

// Does the segment cross any node box (besides a/b)? 2px inset so border-grazes count.
function segHitsBoxes(a: Waypoint, b: Waypoint, skipA: string, skipB: string): boolean {
  for (const n of state.nodes) {
    if (n.id === skipA || n.id === skipB) continue;
    const w = n._w ?? 220;
    const h = n._h ?? 100;
    const x0 = n.x + 2;
    const y0 = n.y + 2;
    const x1 = n.x + w - 2;
    const y1 = n.y + h - 2;
    const inside = (p: Waypoint) => p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1;
    if (inside(a) || inside(b)) return true;
    const r0: Waypoint = { x: x0, y: y0 };
    const r1: Waypoint = { x: x1, y: y0 };
    const r2: Waypoint = { x: x1, y: y1 };
    const r3: Waypoint = { x: x0, y: y1 };
    if (segIntersect(a, b, r0, r1) || segIntersect(a, b, r1, r2) || segIntersect(a, b, r2, r3) || segIntersect(a, b, r3, r0))
      return true;
  }
  return false;
}

// Fewest-bend route from a's border to b's border that dodges all boxes.
// Tries straight, then one-bend L, then two-bend Z (both orientations).
function minimalBendRoute(a: UmlNode, b: UmlNode): Waypoint[] | null {
  const s = anchor(a, b);
  const e = anchor(b, a);
  const mx = (s.x + e.x) / 2;
  const my = (s.y + e.y) / 2;
  const cands: Waypoint[][] = [
    [s, e],
    [s, { x: e.x, y: s.y }, e],
    [s, { x: s.x, y: e.y }, e],
    [s, { x: mx, y: s.y }, { x: mx, y: e.y }, e],
    [s, { x: s.x, y: my }, { x: e.x, y: my }, e],
  ];
  for (const c of cands) {
    let ok = true;
    for (let i = 0; i < c.length - 1; i++) {
      if (segHitsBoxes(c[i], c[i + 1], a.id, b.id)) {
        ok = false;
        break;
      }
    }
    if (ok) return c;
  }
  return null;
}

// Ramer–Douglas–Peucker: drop collinear/wobbling points so bends stay crisp.
function rdp(pts: Waypoint[], eps: number): Waypoint[] {
  if (pts.length < 3) return pts.slice();
  const keep = new Array<boolean>(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  const segDist = (p: Waypoint, a: Waypoint, b: Waypoint): number => {
    const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    if (!l2) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
  };
  while (stack.length) {
    const [i, j] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let k = i + 1; k < j; k++) {
      const d = segDist(pts[k], pts[i], pts[j]);
      if (d > maxD) {
        maxD = d;
        idx = k;
      }
    }
    if (maxD > eps && idx > 0) {
      keep[idx] = true;
      stack.push([i, idx], [idx, j]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

// Catmull–Rom spline through the waypoints as cubic beziers — flowing curves.
// Handles are clamped to 40% of their segment so short stubs can't swing the
// curve around (no circles at line ends: the exit follows the first segment).
function crPath(p: Waypoint[]): string {
  if (p.length < 3) return 'M ' + p.map(q => `${q.x} ${q.y}`).join(' L ');
  const parts: string[] = [`M ${p[0].x} ${p[0].y}`];
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(0, i - 1)];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[Math.min(p.length - 1, i + 2)];
    const cap = Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.4;
    let h1x = (p2.x - p0.x) / 6;
    let h1y = (p2.y - p0.y) / 6;
    let h2x = (p3.x - p1.x) / 6;
    let h2y = (p3.y - p1.y) / 6;
    const l1 = Math.hypot(h1x, h1y);
    if (l1 > cap && l1 > 0) {
      h1x = (h1x * cap) / l1;
      h1y = (h1y * cap) / l1;
    }
    const l2 = Math.hypot(h2x, h2y);
    if (l2 > cap && l2 > 0) {
      h2x = (h2x * cap) / l2;
      h2y = (h2y * cap) / l2;
    }
    parts.push(`C ${p1.x + h1x} ${p1.y + h1y} ${p2.x - h2x} ${p2.y - h2y} ${p2.x} ${p2.y}`);
  }
  return parts.join(' ');
}

// Snap a polyline to axis-aligned segments: any diagonal run becomes a right angle.
function orthoSnap(pts: Waypoint[]): Waypoint[] {
  const out: Waypoint[] = [{ x: pts[0].x, y: pts[0].y }];
  for (let i = 1; i < pts.length; i++) {
    const prev = out[out.length - 1];
    const p = pts[i];
    if (Math.abs(p.x - prev.x) > 1 && Math.abs(p.y - prev.y) > 1) out.push({ x: p.x, y: prev.y });
    out.push({ x: p.x, y: p.y });
  }
  const dedup: Waypoint[] = [];
  for (const p of out) {
    const q = dedup[dedup.length - 1];
    if (!q || Math.hypot(p.x - q.x, p.y - q.y) > 0.5) dedup.push(p);
  }
  return dedup;
}

// Point at half the polyline's total length — the true visual middle of the
// route, no matter how many waypoints cluster near either box.
function polyMid(pts: Waypoint[]): Waypoint {
  if (pts.length < 3) {
    return { x: (pts[0].x + pts[pts.length - 1].x) / 2, y: (pts[0].y + pts[pts.length - 1].y) / 2 };
  }
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  let rem = total / 2;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    const len = Math.hypot(dx, dy);
    if (len > 0 && rem <= len) return { x: pts[i - 1].x + (dx / len) * rem, y: pts[i - 1].y + (dy / len) * rem };
    rem -= len;
  }
  return pts[pts.length - 1];
}

// Build the path `d` for a polyline in the current edge style:
// 'straight' = simple lines, 'ortho' = right angles, 'smooth' = rounded corners,
// 'elliptic' (label: curves) = Catmull-Rom spline through fewest-bend waypoints.
export function pathFromPoints(pts: Waypoint[], style: string): string {
  if (style === 'elliptic') return crPath(pts);
  const r = 24;
  if (style === 'smooth' && pts.length >= 3) {
    const sp = rdp(orthoSnap(pts), 6);
    const parts: string[] = [`M ${sp[0].x} ${sp[0].y}`];
    let cur = sp[0];
    for (let i = 1; i < sp.length - 1; i++) {
      const p = sp[i];
      const next = sp[i + 1];
      const uIn = dir(cur.x, cur.y, p.x, p.y);
      const uOut = dir(p.x, p.y, next.x, next.y);
      const lin = Math.hypot(p.x - cur.x, p.y - cur.y);
      const lout = Math.hypot(next.x - p.x, next.y - p.y);
      if (lin < 1 || lout < 1) continue;
      const rad = Math.min(r, lin / 2, lout / 2);
      const ax = p.x - uIn.x * rad;
      const ay = p.y - uIn.y * rad;
      const bx = p.x + uOut.x * rad;
      const by = p.y + uOut.y * rad;
      if (Math.hypot(ax - cur.x, ay - cur.y) > 0.5) parts.push(`L ${ax} ${ay}`);
      parts.push(`Q ${p.x} ${p.y} ${bx} ${by}`);
      cur = { x: bx, y: by };
    }
    const last = sp[sp.length - 1];
    if (Math.hypot(last.x - cur.x, last.y - cur.y) > 0.5) parts.push(`L ${last.x} ${last.y}`);
    return parts.join(' ');
  }
  return 'M ' + pts.map(p => `${p.x} ${p.y}`).join(' L ');
}

// Give a parallel edge its own lane by sliding ONLY the two endpoints of the
// route's middle stem segment along the direction of the segment before it —
// this translates the stem without ever breaking a 90° bend.
function applyLane(pts: Waypoint[], lane: number, skipA: string, skipB: string): Waypoint[] {
  if (pts.length < 4) return pts;
  let best = 0;
  let k = -1;
  for (let i = 1; i <= pts.length - 3; i++) {
    const l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    // the shift stays axis-aligned only if the segments around the stem are parallel
    const cross =
      (pts[i].x - pts[i - 1].x) * (pts[i + 2].y - pts[i + 1].y) - (pts[i].y - pts[i - 1].y) * (pts[i + 2].x - pts[i + 1].x);
    if (l > best && Math.abs(cross) < 0.01) {
      best = l;
      k = i;
    }
  }
  if (k < 0) return pts;
  const d = dir(pts[k - 1].x, pts[k - 1].y, pts[k].x, pts[k].y);
  const off = lane * 16;
  const shifted = pts.map((p, i) =>
    i === k || i === k + 1 ? { x: p.x + d.x * off, y: p.y + d.y * off } : p
  );
  // keep the lane inside free space if the default side is blocked
  let ok = true;
  for (let i = 0; i < shifted.length - 1; i++) {
    if (segHitsBoxes(shifted[i], shifted[i + 1], skipA, skipB)) {
      ok = false;
      break;
    }
  }
  if (ok) return shifted;
  return pts.map((p, i) =>
    i === k || i === k + 1 ? { x: p.x - d.x * off, y: p.y - d.y * off } : p
  );
}

export function renderEdges(): void {
  edgePaths.textContent = '';
  (document.getElementById('link-ghost') as SVGGElement | null)?.replaceChildren();
  const laneOf = new Map<string, number>();
  const groupCount = new Map<string, number>();
  for (const e of state.edges) {
    if (e.from === e.to) continue;
    const key = [e.from, e.to].sort().join('|');
    const n = groupCount.get(key) ?? 0;
    laneOf.set(e.id, n);
    groupCount.set(key, n + 1);
  }
  const labels: Array<{ el: SVGTextElement; x: number; y: number }> = [];
  for (const e of state.edges) {
    const a = nodeById(e.from);
    const b = nodeById(e.to);
    if (!a || !b) continue;
    const def = EDGE_KINDS[e.kind] ?? EDGE_KINDS.association;

    const g = svgEl('g') as SVGGElement;
    g.classList.add('edge-g');
    g.dataset.id = e.id;
    if (selEdge(e.id)) g.classList.add('selected');
    if (isPending('edge', e.id)) g.classList.add('ai-change');
    if (e.note) {
      const t = svgEl('title') as SVGTitleElement;
      t.textContent = e.note;
      g.appendChild(t);
    }

    const markerStart = def.start ? ` url(#${def.start})` : '';
    const markerEnd = ` url(#${def.end})`;

    let labelX: number;
    let labelY: number;

    if (e.from === e.to) {
      // self-relation loop on the right side of the node
      const w = a._w ?? 220;
      const h = a._h ?? 100;
      const y1 = a.y + h * 0.25;
      const y2 = a.y + h * 0.6;
      const x = a.x + w;
      const d = `M ${x} ${y1} C ${x + 55} ${y1}, ${x + 55} ${y2}, ${x} ${y2}`;
      const hit = svgEl('path') as SVGPathElement;
      hit.setAttribute('d', d);
      hit.setAttribute('class', 'edge-hit');
      g.appendChild(hit);
      const line = svgEl('path') as SVGPathElement;
      line.setAttribute('d', d);
      line.setAttribute('class', 'edge-line' + (def.dashed ? ' dashed' : ''));
      line.setAttribute('marker-start', markerStart);
      line.setAttribute('marker-end', markerEnd);
      g.appendChild(line);
      labelX = x + 66;
      labelY = (y1 + y2) / 2;
    } else {
      const style = state.edgeStyle;
      let pts: Waypoint[];
      let mid: { x: number; y: number };
      if (style === 'straight') {
        const s = anchor(a, b);
        const en = anchor(b, a);
        pts = [s, en];
        mid = { x: (s.x + en.x) / 2, y: (s.y + en.y) / 2 };
      } else if (style === 'elliptic') {
        // fewest possible bends: straight, then L, then Z; corridor route only as last resort
        pts = minimalBendRoute(a, b) ?? edgeRoute(a, b).pts;
        mid = polyMid(pts);
      } else {
        // rectangular/smooth always route live from current box positions
        const route = edgeRoute(a, b);
        pts = route.pts;
        mid = route.mid;
      }
      // parallel edges between the same two boxes run as separate lanes
      const lane = laneOf.get(e.id) ?? 0;
      if (lane > 0) {
        pts = applyLane(pts, lane, a.id, b.id);
        mid = polyMid(pts);
      }
      const d = pathFromPoints(pts, style);
      const hit = svgEl('path') as SVGPathElement;
      hit.setAttribute('d', d);
      hit.setAttribute('class', 'edge-hit');
      g.appendChild(hit);

      const line = svgEl('path') as SVGPathElement;
      line.setAttribute('d', d);
      line.setAttribute('class', 'edge-line' + (def.dashed ? ' dashed' : ''));
      line.setAttribute('marker-start', markerStart);
      line.setAttribute('marker-end', markerEnd);
      g.appendChild(line);

      const P0 = pts[0];
      const PL = pts[pts.length - 1];
      if (e.fromMult) {
        const u1 = dir(P0.x, P0.y, pts[1].x, pts[1].y);
        g.appendChild(edgeLabelText(P0.x + u1.x * 18, P0.y + u1.y * 18 - 4, e.fromMult, 'edge-mult'));
      }
      if (e.toMult) {
        const u2 = dir(PL.x, PL.y, pts[pts.length - 2].x, pts[pts.length - 2].y);
        g.appendChild(edgeLabelText(PL.x + u2.x * 18, PL.y + u2.y * 18 - 4, e.toMult, 'edge-mult'));
      }
      labelX = mid.x;
      labelY = mid.y - 6;
    }

    if (e.label) {
      const el = edgeLabelText(labelX, labelY, e.label, 'edge-label');
      g.appendChild(el);
      labels.push({ el, x: labelX, y: labelY });
    }

    edgePaths.appendChild(g);
  }

  // de-collision: push stacked relation labels apart so every word stays readable
  labels.sort((p, q) => p.y - q.y);
  for (let i = 1; i < labels.length; i++) {
    for (let j = 0; j < i; j++) {
      if (Math.abs(labels[i].y - labels[j].y) < 14 && Math.abs(labels[i].x - labels[j].x) < 90) {
        labels[i].y = labels[j].y + 16;
      }
    }
    labels[i].el.setAttribute('y', String(labels[i].y));
  }
}

// Final safety net: push apart nodes that still overlap, using their measured
// real sizes (CLI estimates can miss; fallback fonts differ). Edges touching
// moved nodes lose their stored polyline and fall back to live elbow routing.
function resolveOverlaps(): void {
  const GAP = 16;
  const moved = new Set<string>();
  for (let pass = 0; pass < 60; pass++) {
    let any = false;
    const ns = state.nodes;
    for (let i = 0; i < ns.length; i++) {
      for (let j = i + 1; j < ns.length; j++) {
        const a = ns[i];
        const b = ns[j];
        const aw = a._w ?? 220;
        const ah = a._h ?? 100;
        const bw = b._w ?? 220;
        const bh = b._h ?? 100;
        const ox = Math.min(a.x + aw, b.x + bw) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + ah, b.y + bh) - Math.max(a.y, b.y);
        if (ox <= 0 || oy <= 0) continue;
        any = true;
        if (ox < oy) {
          const d = (ox + GAP) / 2;
          if (a.x + aw / 2 <= b.x + bw / 2) {
            a.x -= d;
            b.x += d;
          } else {
            a.x += d;
            b.x -= d;
          }
        } else {
          const d = (oy + GAP) / 2;
          if (a.y + ah / 2 <= b.y + bh / 2) {
            a.y -= d;
            b.y += d;
          } else {
            a.y += d;
            b.y -= d;
          }
        }
        moved.add(a.id);
        moved.add(b.id);
      }
    }
    if (!any) break;
  }
  if (!moved.size) return;
  for (const n of state.nodes) {
    if (!moved.has(n.id)) continue;
    const el = nodesLayer.querySelector<HTMLElement>(`.node[data-id="${n.id}"]`);
    if (el) {
      el.style.left = n.x + 'px';
      el.style.top = n.y + 'px';
    }
  }
}

export function renderAll(): void {
  renderNodes();
  resolveOverlaps();
  renderEdges();
}

export function updateSelectionStyles(): void {
  nodesLayer.querySelectorAll<HTMLElement>('.node').forEach(el => {
    el.classList.toggle('selected', selNode(el.dataset.id ?? ''));
    el.classList.toggle('link-source', state.linkFrom === el.dataset.id);
  });
  edgePaths.querySelectorAll<SVGGElement>('.edge-g').forEach(g => {
    g.classList.toggle('selected', selEdge(g.dataset.id ?? ''));
  });
}
