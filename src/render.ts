import {
  EDGE_KINDS,
  KINDS,
  SVG_NS,
  clamp,
  esc,
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
  row.className = 'member';
  row.dataset.mid = m.id;
  const isEnum = n.kind === 'enum';
  if (isEnum) {
    const name = m.name ? esc(m.name) : '<span class="unnamed">(unnamed)</span>';
    const val = m.type ? `<span class="m-type"> = ${esc(m.type)}</span>` : '';
    row.innerHTML = `<span class="m-name">${name}</span>${val}`;
    return row;
  }
  const mods = m.mods.length ? `<span class="m-mods">${esc(m.mods.join(' '))} </span>` : '';
  const vis = m.vis ? `<span class="m-vis">${esc(m.vis)}</span>` : '';
  const params = key === 'methods' ? `<span class="m-params">(${esc(m.params ?? '')})</span>` : '';
  const name = m.name ? esc(m.name) : '<span class="unnamed">(unnamed)</span>';
  const type = m.type ? `<span class="m-type">: ${esc(m.type)}</span>` : '';
  row.innerHTML = `${mods}${vis}${vis ? ' ' : ''}<span class="m-name">${name}</span>${params}${type}`;
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
      (state.linkFrom === n.id ? ' link-source' : '');
    el.dataset.id = n.id;
    el.style.left = n.x + 'px';
    el.style.top = n.y + 'px';

    const head = document.createElement('div');
    head.className = 'node-head';
    const stereo = KINDS[n.kind]?.stereo ?? '';
    head.innerHTML =
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

export function renderEdges(): void {
  edgePaths.textContent = '';
  (document.getElementById('link-ghost') as SVGGElement | null)?.replaceChildren();
  for (const e of state.edges) {
    const a = nodeById(e.from);
    const b = nodeById(e.to);
    if (!a || !b) continue;
    const def = EDGE_KINDS[e.kind] ?? EDGE_KINDS.association;

    const g = svgEl('g') as SVGGElement;
    g.classList.add('edge-g');
    g.dataset.id = e.id;
    if (selEdge(e.id)) g.classList.add('selected');

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
      const p1 = anchor(a, b);
      const p2 = anchor(b, a);
      const hit = svgEl('line') as SVGLineElement;
      hit.setAttribute('x1', String(p1.x));
      hit.setAttribute('y1', String(p1.y));
      hit.setAttribute('x2', String(p2.x));
      hit.setAttribute('y2', String(p2.y));
      hit.setAttribute('class', 'edge-hit');
      g.appendChild(hit);

      const line = svgEl('line') as SVGLineElement;
      line.setAttribute('x1', String(p1.x));
      line.setAttribute('y1', String(p1.y));
      line.setAttribute('x2', String(p2.x));
      line.setAttribute('y2', String(p2.y));
      line.setAttribute('class', 'edge-line' + (def.dashed ? ' dashed' : ''));
      line.setAttribute('marker-start', markerStart);
      line.setAttribute('marker-end', markerEnd);
      g.appendChild(line);

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      if (e.fromMult)
        g.appendChild(edgeLabelText(p1.x + ux * 20, p1.y + uy * 20 - 4, e.fromMult, 'edge-mult'));
      if (e.toMult)
        g.appendChild(edgeLabelText(p2.x - ux * 20, p2.y - uy * 20 - 4, e.toMult, 'edge-mult'));
      labelX = (p1.x + p2.x) / 2;
      labelY = (p1.y + p2.y) / 2 - 6;
    }

    if (e.label) g.appendChild(edgeLabelText(labelX, labelY, e.label, 'edge-label'));

    edgePaths.appendChild(g);
  }
}

export function renderAll(): void {
  renderNodes();
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
