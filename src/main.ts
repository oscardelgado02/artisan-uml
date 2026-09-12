import './style.css';

import {
  EDGE_KINDS,
  KINDS,
  VISIBILITY,
  edgeById,
  memberKey,
  nodeById,
  selEdge,
  selNode,
  state,
  uid,
} from './model';
import type { EdgeKind, EdgeStyle, NodeKind } from './model';
import {
  applyCam,
  fitView,
  nearestBorderPoint,
  nodesLayer,
  onBorder,
  renderAll,
  renderEdges,
  svgEl,
  syncColorize,
  toCanvas,
  updateSelectionStyles,
  viewCenter,
  zoomAt,
  wrap,
} from './render';
import {
  LS_KEY,
  loadInto,
  pushPre,
  redo,
  save,
  saveThrottled,
  seedData,
  serverRef,
  fileRef,
  undo,
  updateUndoButtons,
} from './storage';
import { tidyAll } from './tidy';
import type { SerializedDiagram } from './storage';
import {
  DEFAULT_HINT,
  activeMenuRef,
  activePopoverRef,
  closePopovers,
  openEdgeEditor,
  openMemberEditor,
  openMenu,
  openNodeNoteEditor,
  openProjectNotes,
  setHint,
  startRename,
  toast,
} from './editors';
import { copyPlantUML, downloadPlantUML, exportJSON, importJSONFile } from './exporters';
import type { MenuEntry, MenuItem } from './types';
import type { PendingRef } from './model';

const btnAddNode = document.getElementById('btn-add-node') as HTMLButtonElement;
const btnColorize = document.getElementById('btn-colorize') as HTMLButtonElement;
const btnTidy = document.getElementById('btn-tidy') as HTMLButtonElement;
const selLines = document.getElementById('sel-lines') as HTMLSelectElement;
const btnUndo = document.getElementById('btn-undo') as HTMLButtonElement;
const btnRedo = document.getElementById('btn-redo') as HTMLButtonElement;
const btnExport = document.getElementById('btn-export') as HTMLButtonElement;
const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
const fileImport = document.getElementById('file-import') as HTMLInputElement;

const SUN_ICON =
  '<circle cx="8" cy="8" r="3.2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M12.8 3.2l-1.4 1.4M4.6 11.4l-1.4 1.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>';
const MOON_ICON =
  '<path d="M13.5 9.8A6 6 0 0 1 6.2 2.5a6 6 0 1 0 7.3 7.3Z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/>';

interface DragState {
  id: string;
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  moved: boolean;
}

interface PanState {
  sx: number;
  sy: number;
  cx: number;
  cy: number;
}

let pan: PanState | null = null;
let drag: DragState | null = null;
let ghostLine: SVGLineElement | null = null;
let downPort: { id: string; point: { x: number; y: number }; sx: number; sy: number } | null = null;
let lastMouse = { x: 0, y: 0 };
let cursorNode: HTMLElement | null = null;
let suppressClick = false;

function suppressNextClick(): void {
  suppressClick = true;
  setTimeout(() => (suppressClick = false), 0);
}

function addNodeAt(kind: NodeKind, cx?: number, cy?: number): void {
  const pos = cx == null || cy == null ? viewCenter() : { x: cx, y: cy };
  pushPre();
  const n = {
    id: uid(),
    kind,
    name: '',
    x: Math.round(pos.x - 110),
    y: Math.round(pos.y - 40),
    attributes: [],
    methods: [],
  };
  state.nodes.push(n);
  state.selected = { type: 'node', id: n.id };
  renderAll();
  save();
  startRename(n.id);
}

function addMember(nodeId: string, key: 'attributes' | 'methods'): void {
  const n = nodeById(nodeId);
  if (!n) return;
  pushPre();
  const m =
    n.kind === 'enum'
      ? { id: uid(), vis: '-' as const, name: '', type: '', mods: [] as string[], params: null }
      : key === 'attributes'
        ? { id: uid(), vis: '-' as const, name: '', type: 'int', mods: [] as string[], params: null }
        : { id: uid(), vis: '+' as const, name: '', type: 'void', mods: [] as string[], params: '' };
  n[key].push(m);
  renderAll();
  save();
  openMemberEditor(nodeId, m.id);
}

function createEdge(from: string, to: string, kind: EdgeKind): void {
  pushPre();
  state.edges.push({ id: uid(), kind, from, to, label: '', fromMult: '', toMult: '' });
  renderAll();
  save();
  toast('Relation added');
}

function deleteNode(id: string): void {
  pushPre();
  state.nodes = state.nodes.filter(n => n.id !== id);
  state.edges = state.edges.filter(e => e.from !== id && e.to !== id);
  if (selNode(id)) state.selected = null;
  renderAll();
  save();
  toast('Node deleted');
}

function deleteEdge(id: string): void {
  pushPre();
  state.edges = state.edges.filter(e => e.id !== id);
  if (selEdge(id)) state.selected = null;
  renderAll();
  save();
  toast('Relation deleted');
}

function deleteSelected(): void {
  if (!state.selected) return;
  if (state.selected.type === 'node') deleteNode(state.selected.id);
  else deleteEdge(state.selected.id);
}

function duplicateNode(id: string): void {
  const n = nodeById(id);
  if (!n) return;
  pushPre();
  const copy = {
    id: uid(),
    kind: n.kind,
    name: n.name,
    x: n.x + 36,
    y: n.y + 36,
    attributes: n.attributes.map(m => ({ ...m, id: uid(), mods: [...m.mods] })),
    methods: n.methods.map(m => ({ ...m, id: uid(), mods: [...m.mods] })),
  };
  state.nodes.push(copy);
  state.selected = { type: 'node', id: copy.id };
  renderAll();
  save();
  toast('Node duplicated');
}

function changeKind(id: string, kind: NodeKind): void {
  const n = nodeById(id);
  if (!n || n.kind === kind) return;
  pushPre();
  n.kind = kind;
  renderAll();
  save();
}

function cancelLinkMode(): void {
  if (!state.linkFrom && !state.linkKind) return;
  state.linkFrom = null;
  state.linkPoint = null;
  state.linkKind = null;
  removeGhost();
  clearLinkTarget();
  setHint(DEFAULT_HINT);
  updateSelectionStyles();
}

function startLinkFrom(nodeId: string, kind: EdgeKind | null, mx: number, my: number): void {
  const n = nodeById(nodeId);
  if (!n) return;
  closePopovers();
  const c = toCanvas(mx, my);
  state.linkFrom = nodeId;
  state.linkPoint = nearestBorderPoint(n, c.x, c.y);
  state.linkKind = kind;
  setHint(
    kind
      ? `${EDGE_KINDS[kind].label}: click the target node (Esc to cancel)`
      : 'Click the target node to pick a relation kind (Esc to cancel)'
  );
  updateSelectionStyles();
  updateGhost(mx, my);
}

function completeLink(e: MouseEvent): void {
  const target = (e.target as Element).closest('.node');
  if (!target) {
    cancelLinkMode();
    return;
  }
  const from = state.linkFrom;
  const kind = state.linkKind;
  const to = target.getAttribute('data-id') ?? '';
  cancelLinkMode();
  if (!from || !to) return;
  if (kind) createEdge(from, to, kind);
  else openRelKindMenu(from, to, e.clientX, e.clientY);
}

function applyThemeIcon(): void {
  const icon = document.querySelector<SVGElement>('#icon-theme');
  if (icon) icon.innerHTML = document.documentElement.classList.contains('dark') ? SUN_ICON : MOON_ICON;
}

function kindMenuEntries(action: (kind: NodeKind) => void): MenuItem[] {
  return (Object.entries(KINDS) as Array<[NodeKind, (typeof KINDS)[NodeKind]]>).map(([k, v]) => ({
    label: v.label,
    action: () => action(k),
  }));
}

function nodeMenu(nodeId: string, x: number, y: number): void {
  const n = nodeById(nodeId);
  const attrLabel = n ? (n.kind === 'enum' ? 'Add value' : n.kind === 'interface' ? 'Add property' : 'Add attribute') : 'Add attribute';
  openMenu(x, y, [
    { label: 'Rename', action: () => startRename(nodeId) },
    { label: 'Edit note…', action: () => openNodeNoteEditor(nodeId) },
    '-',
    { label: attrLabel, action: () => addMember(nodeId, 'attributes') },
    ...(n && n.kind !== 'enum' ? [{ label: 'Add method', action: () => addMember(nodeId, 'methods') } as MenuItem] : []),
    '-',
    { label: 'Set kind', sub: kindMenuEntries(kind => changeKind(nodeId, kind)) },
    {
      label: 'Relations',
      sub: (Object.entries(EDGE_KINDS) as Array<[EdgeKind, (typeof EDGE_KINDS)[EdgeKind]]>).map(
        ([k, v]) => ({
          label: v.label,
          action: () => startLinkFrom(nodeId, k, lastMouse.x, lastMouse.y),
        })
      ),
    },
    '-',
    { label: 'Duplicate', action: () => duplicateNode(nodeId) },
    { label: 'Delete', danger: true, action: () => deleteNode(nodeId) },
  ]);
}

function memberMenu(nodeId: string, mid: string, x: number, y: number): void {
  const n = nodeById(nodeId);
  if (!n) return;
  const key = memberKey(n, mid);
  const isEnum = n.kind === 'enum';
  openMenu(x, y, [
    { label: 'Edit', action: () => openMemberEditor(nodeId, mid) },
    '-',
    ...(isEnum
      ? []
      : VISIBILITY.map(v => ({
          label: `Set ${v.label} (${v.k})`,
          action: () => {
            pushPre();
            const m = n.attributes.find(a => a.id === mid) ?? n.methods.find(a => a.id === mid);
            if (m) m.vis = v.k;
            renderAll();
            save();
          },
        }))),
    ...(isEnum ? [] : (['-'] as MenuEntry[])),
    {
      label: 'Delete member',
      danger: true,
      action: () => {
        pushPre();
        n[key] = n[key].filter(m => m.id !== mid);
        renderAll();
        save();
        toast('Member deleted');
      },
    },
  ]);
}

function edgeMenu(eid: string, x: number, y: number): void {
  openMenu(x, y, [
    { label: 'Edit relation', action: () => openEdgeEditor(eid) },
    {
      label: 'Reverse',
      action: () => {
        pushPre();
        const e = edgeById(eid);
        if (!e) return;
        const tmp = e.from;
        e.from = e.to;
        e.to = tmp;
        renderAll();
        save();
      },
    },
    { label: 'Delete', danger: true, action: () => deleteEdge(eid) },
  ]);
}

function canvasMenu(x: number, y: number): void {
  const pos = toCanvas(x, y);
  openMenu(x, y, [
    ...kindMenuEntries(kind => addNodeAt(kind, pos.x, pos.y)),
    '-',
    { label: 'Fit view', action: fitView },
  ]);
}

function removeGhost(): void {
  ghostLine?.remove();
  ghostLine = null;
}

function portDot(): HTMLDivElement {
  let el = document.getElementById('port-dot') as HTMLDivElement | null;
  if (!el || !el.isConnected) {
    el = document.createElement('div');
    el.id = 'port-dot';
    nodesLayer.appendChild(el);
  }
  return el;
}

function hidePortDot(): void {
  const el = document.getElementById('port-dot');
  if (el) el.style.display = 'none';
}

function clearLinkTarget(): void {
  nodesLayer.querySelectorAll<HTMLElement>('.node.link-target').forEach(el => el.classList.remove('link-target'));
}

function updateGhost(mx: number, my: number): void {
  const from = state.linkFrom ? nodeById(state.linkFrom) : null;
  if (!from) return;
  if (!ghostLine || !ghostLine.isConnected) {
    ghostLine = svgEl('line') as SVGLineElement;
    ghostLine.setAttribute('class', 'ghost-line');
    (document.querySelector<SVGGElement>('#link-ghost') as SVGGElement).appendChild(ghostLine);
  }
  const c = toCanvas(mx, my);
  const o = state.linkPoint ?? nearestBorderPoint(from, c.x, c.y);
  ghostLine.setAttribute('x1', String(o.x));
  ghostLine.setAttribute('y1', String(o.y));
  ghostLine.setAttribute('x2', String(c.x));
  ghostLine.setAttribute('y2', String(c.y));
  const under = document.elementFromPoint(mx, my)?.closest('.node');
  const tid = under?.getAttribute('data-id') ?? null;
  nodesLayer.querySelectorAll<HTMLElement>('.node.link-target').forEach(el => {
    if (el.dataset.id !== tid) el.classList.remove('link-target');
  });
  if (tid && under && !under.classList.contains('link-target')) under.classList.add('link-target');
}

function openRelKindMenu(from: string, to: string, x: number, y: number): void {
  openMenu(
    x,
    y,
    (Object.entries(EDGE_KINDS) as Array<[EdgeKind, (typeof EDGE_KINDS)[EdgeKind]]>).map(([k, v]) => ({
      label: v.label,
      action: () => createEdge(from, to, k),
    }))
  );
}

wrap.addEventListener('mousedown', (e: MouseEvent) => {
  const target = e.target as Element;
  if (e.button === 1) {
    pan = { sx: e.clientX, sy: e.clientY, cx: state.cam.x, cy: state.cam.y };
    wrap.classList.add('grabbing');
    e.preventDefault();
    return;
  }
  if (e.button !== 0) return;
  if (state.linkFrom) {
    if (target.closest('.node')) {
      completeLink(e);
      suppressNextClick();
    } else {
      cancelLinkMode();
    }
    return;
  }
  const nodeEl = target.closest('.node');
  if (nodeEl) {
    const id = nodeEl.getAttribute('data-id') ?? '';
    const n = nodeById(id);
    if (!n) return;
    const p = toCanvas(e.clientX, e.clientY);
    const interactive = target.closest('.member') || target.closest('.add-btn') || target.closest('.node-name');
    if (!interactive && onBorder(n, p.x, p.y)) {
      downPort = { id, point: nearestBorderPoint(n, p.x, p.y), sx: e.clientX, sy: e.clientY };
    } else {
      drag = { id, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, moved: false };
    }
  } else {
    pan = { sx: e.clientX, sy: e.clientY, cx: state.cam.x, cy: state.cam.y };
    wrap.classList.add('grabbing');
  }
});

document.addEventListener('mousemove', (e: MouseEvent) => {
  lastMouse.x = e.clientX;
  lastMouse.y = e.clientY;
  if (!(e.target as Element).closest?.('.node')) {
    hidePortDot();
    if (cursorNode) {
      cursorNode.style.cursor = '';
      cursorNode = null;
    }
  }
  if (state.linkFrom) {
    updateGhost(e.clientX, e.clientY);
    return;
  }
  if (downPort) {
    if (Math.hypot(e.clientX - downPort.sx, e.clientY - downPort.sy) > 3) {
      if (!state.linkFrom) {
        state.linkFrom = downPort.id;
        state.linkPoint = downPort.point;
        setHint('Drop on a class to pick a relation kind — release on empty canvas to cancel');
        updateSelectionStyles();
      }
      updateGhost(e.clientX, e.clientY);
    }
    return;
  }
  if (pan) {
    state.cam.x = pan.cx + (e.clientX - pan.sx);
    state.cam.y = pan.cy + (e.clientY - pan.sy);
    applyCam();
    return;
  }
  if (!drag) return;
  const dx = e.clientX - drag.sx;
  const dy = e.clientY - drag.sy;
  if (!drag.moved && Math.hypot(dx, dy) < 3) return;
  drag.moved = true;
  const n = nodeById(drag.id);
  if (!n) return;
  n.x = drag.ox + dx / state.cam.z;
  n.y = drag.oy + dy / state.cam.z;
  const el = nodesLayer.querySelector<HTMLElement>(`.node[data-id="${drag.id}"]`);
  if (el) {
    el.style.left = n.x + 'px';
    el.style.top = n.y + 'px';
  }
  renderEdges();
});

document.addEventListener('mouseup', (e: MouseEvent) => {
  const target = e.target as Element;
  if (e.button !== 0) return;
  if (pan) {
    const moved = Math.hypot(e.clientX - pan.sx, e.clientY - pan.sy) > 3;
    wrap.classList.remove('grabbing');
    pan = null;
    saveThrottled();
    if (moved) return;
    if (
      !target.closest('.node') &&
      !target.closest('.edge-g') &&
      !target.closest('.popover') &&
      !target.closest('.ctx-menu') &&
      state.selected
    ) {
      state.selected = null;
      updateSelectionStyles();
    }
    return;
  }
  if (downPort) {
    const dp = downPort;
    downPort = null;
    if (state.linkFrom) {
      const from = state.linkFrom;
      const kind = state.linkKind;
      const to = target.closest('.node')?.getAttribute('data-id') ?? '';
      cancelLinkMode();
      if (to) {
        if (kind) createEdge(from, to, kind);
        else openRelKindMenu(from, to, e.clientX, e.clientY);
      }
    } else {
      state.linkFrom = dp.id;
      state.linkPoint = dp.point;
      setHint('Click the target node to link (click the same node for a self-relation, Esc cancels)');
      updateSelectionStyles();
      updateGhost(e.clientX, e.clientY);
    }
    return;
  }
  if (!drag) return;
  const wasDrag = drag.moved;
  const id = drag.id;
  drag = null;
  if (wasDrag) {
    saveThrottled();
    return;
  }
  state.selected = { type: 'node', id };
  updateSelectionStyles();
});

wrap.addEventListener(
  'wheel',
  (e: WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.002));
    } else {
      state.cam.x -= e.deltaX;
      state.cam.y -= e.deltaY;
      applyCam();
    }
    saveThrottled();
  },
  { passive: false }
);

wrap.addEventListener('dblclick', (e: MouseEvent) => {
  if ((e.target as Element).closest('.node')) return;
  const pos = toCanvas(e.clientX, e.clientY);
  addNodeAt('class', pos.x, pos.y);
});

nodesLayer.addEventListener('click', (e: MouseEvent) => {
  const addBtn = (e.target as Element).closest('.add-btn');
  if (addBtn) {
    const nodeEl = addBtn.closest('.node');
    const id = nodeEl?.getAttribute('data-id') ?? '';
    addMember(id, addBtn.getAttribute('data-action') === 'add-attributes' ? 'attributes' : 'methods');
    return;
  }
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  if (state.linkFrom) return;
  const nameEl = (e.target as Element).closest('.node-name');
  if (nameEl) {
    const id = nameEl.closest('.node')?.getAttribute('data-id') ?? '';
    startRename(id);
    return;
  }
  const memberEl = (e.target as Element).closest('.member');
  if (memberEl) {
    const id = memberEl.closest('.node')?.getAttribute('data-id') ?? '';
    openMemberEditor(id, memberEl.getAttribute('data-mid') ?? '');
  }
});

nodesLayer.addEventListener('contextmenu', (e: MouseEvent) => {
  e.preventDefault();
  if (state.linkFrom) {
    cancelLinkMode();
    return;
  }
  const target = e.target as Element;
  const memberEl = target.closest('.member');
  if (memberEl) {
    memberMenu(
      memberEl.closest('.node')?.getAttribute('data-id') ?? '',
      memberEl.getAttribute('data-mid') ?? '',
      e.clientX,
      e.clientY
    );
    return;
  }
  const nodeEl = target.closest('.node');
  if (nodeEl) {
    const id = nodeEl.getAttribute('data-id') ?? '';
    state.selected = { type: 'node', id };
    updateSelectionStyles();
    nodeMenu(id, e.clientX, e.clientY);
  }
});

const edgesSvg = document.querySelector<SVGSVGElement>('#edges') as SVGSVGElement;

edgesSvg.addEventListener('click', (e: MouseEvent) => {
  const g = (e.target as Element).closest('.edge-g');
  if (!g || state.linkFrom) return;
  const id = g.getAttribute('data-id') ?? '';
  state.selected = { type: 'edge', id };
  renderEdges();
  openEdgeEditor(id);
});

edgesSvg.addEventListener('contextmenu', (e: MouseEvent) => {
  const g = (e.target as Element).closest('.edge-g');
  if (!g) return;
  e.preventDefault();
  e.stopPropagation();
  edgeMenu(g.getAttribute('data-id') ?? '', e.clientX, e.clientY);
});

wrap.addEventListener('contextmenu', (e: MouseEvent) => {
  const target = e.target as Element;
  if (target.closest('.node') || target.closest('.edge-g')) return;
  e.preventDefault();
  if (state.linkFrom) {
    cancelLinkMode();
    return;
  }
  canvasMenu(e.clientX, e.clientY);
});

nodesLayer.addEventListener('mousemove', (e: MouseEvent) => {
  const nodeEl = (e.target as Element).closest('.node');
  if (cursorNode && cursorNode !== nodeEl) {
    cursorNode.style.cursor = '';
    cursorNode = null;
  }
  if (!nodeEl || drag || downPort || pan || state.linkFrom) {
    hidePortDot();
    return;
  }
  const n = nodeById(nodeEl.getAttribute('data-id') ?? '');
  if (!n) {
    hidePortDot();
    return;
  }
  const p = toCanvas(e.clientX, e.clientY);
  const el = nodeEl as HTMLElement;
  if (onBorder(n, p.x, p.y)) {
    const bp = nearestBorderPoint(n, p.x, p.y);
    const dot = portDot();
    dot.style.left = bp.x + 'px';
    dot.style.top = bp.y + 'px';
    dot.style.display = 'block';
    el.style.cursor = 'crosshair';
    cursorNode = el;
  } else {
    hidePortDot();
    el.style.cursor = '';
  }
});

document.addEventListener(
  'mousedown',
  e => {
    const target = e.target as Element;
    if (activeMenuRef.current && !activeMenuRef.current.contains(target)) closePopovers();
    else if (activePopoverRef.current && !activePopoverRef.current.el.contains(target)) closePopovers();
  },
  true
);

document.addEventListener('keydown', e => {
  const target = e.target as HTMLElement;
  if (target.matches?.('input, select, textarea')) {
    if (e.key === 'Escape') target.blur();
    return;
  }
  const mod = e.ctrlKey || e.metaKey;
  if (e.key === 'Escape') {
    closePopovers();
    cancelLinkMode();
    downPort = null;
    hidePortDot();
    if (state.selected) {
      state.selected = null;
      updateSelectionStyles();
    }
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    deleteSelected();
  } else if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
    e.preventDefault();
    undo();
  } else if ((mod && e.key.toLowerCase() === 'z' && e.shiftKey) || (mod && e.key.toLowerCase() === 'y')) {
    e.preventDefault();
    redo();
  }
});

btnAddNode.addEventListener('click', () => {
  const r = btnAddNode.getBoundingClientRect();
  openMenu(r.left, r.bottom + 6, kindMenuEntries(kind => addNodeAt(kind)));
});

btnTidy.addEventListener('click', () => {
  tidyAll();
  toast('Layout tidied');
});

selLines.addEventListener('change', () => {
  const v = selLines.value as EdgeStyle;
  if (v === 'straight' || v === 'ortho' || v === 'smooth' || v === 'elliptic') {
    state.edgeStyle = v;
    renderAll();
    save();
  }
});

btnColorize.addEventListener('click', () => {  state.colorize = !state.colorize;
  syncColorize();
  renderEdges();
  save();
});

btnUndo.addEventListener('click', undo);
btnRedo.addEventListener('click', redo);

btnExport.addEventListener('click', () => {
  const r = btnExport.getBoundingClientRect();
  openMenu(r.left, r.bottom + 6, [
    { label: 'Export JSON', action: exportJSON },
    { label: 'Import JSON', action: () => fileImport.click() },
    '-',
    { label: 'Copy PlantUML', action: copyPlantUML },
    { label: 'Download PlantUML', action: downloadPlantUML },
  ]);
});

(document.getElementById('btn-import') as HTMLButtonElement).addEventListener('click', () => {
  fileImport.click();
});

fileImport.addEventListener('change', () => {
  if (fileImport.files && fileImport.files[0]) importJSONFile(fileImport.files[0]);
  fileImport.value = '';
});

(document.getElementById('btn-theme') as HTMLButtonElement).addEventListener('click', () => {
  const html = document.documentElement;
  html.classList.toggle('dark');
  localStorage.setItem('wise-uml-theme', html.classList.contains('dark') ? 'dark' : 'light');
  applyThemeIcon();
});

btnClear.addEventListener('click', () => {
  if (!state.nodes.length && !state.edges.length) {
    toast('Diagram is already empty');
    return;
  }
  if (!confirm('Delete all nodes and relations?')) return;
  pushPre();
  state.nodes = [];
  state.edges = [];
  state.selected = null;
  renderAll();
  save();
  toast('Diagram cleared');
});

(document.getElementById('zoom-in') as HTMLButtonElement).addEventListener('click', () => {
  const r = wrap.getBoundingClientRect();
  zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.2);
  saveThrottled();
});
(document.getElementById('zoom-out') as HTMLButtonElement).addEventListener('click', () => {
  const r = wrap.getBoundingClientRect();
  zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.2);
  saveThrottled();
});
(document.getElementById('zoom-fit') as HTMLButtonElement).addEventListener('click', fitView);

const btnNotes = document.getElementById('btn-notes') as HTMLButtonElement;
const btnAck = document.getElementById('btn-ack') as HTMLButtonElement;
const btnConnect = document.getElementById('btn-connect') as HTMLButtonElement;

btnNotes.addEventListener('click', openProjectNotes);

btnConnect.addEventListener('click', async () => {
  try {
    const picker = (window as unknown as { showOpenFilePicker?: (o: unknown) => Promise<unknown[]> }).showOpenFilePicker;
    if (!picker) {
      toast('Autosave needs Chrome/Edge — use Export JSON instead');
      return;
    }
    const handles = await picker.call(window, {
      types: [{ description: 'Artisan diagram', accept: { 'application/json': ['.json'] } }],
    });
    fileRef.handle = handles[0];
    btnConnect.style.display = 'none';
    toast('Connected — edits now autosave to your diagram.json');
  } catch {
    /* picker cancelled */
  }
});

function syncAckButton(): void {
  const count = state.aiPending.length;
  btnAck.style.display = count ? '' : 'none';
  btnAck.textContent = `Mark AI changes seen (${count})`;
}

async function refreshPending(): Promise<void> {
  try {
    const res = await fetch('/api/pending');
    if (!res.ok) return;
    const data = (await res.json()) as { refs?: PendingRef[] };
    const refs = Array.isArray(data.refs) ? data.refs : [];
    if (JSON.stringify(refs) !== JSON.stringify(state.aiPending)) {
      state.aiPending = refs;
      syncAckButton();
      renderAll();
    }
  } catch {
    /* offline */
  }
}

btnAck.addEventListener('click', async () => {
  if (!serverRef.current) {
    toast('Run `artisan ack` in your project to confirm');
    return;
  }
  try {
    const res = await fetch('/api/ack', { method: 'POST' });
    if (!res.ok) return;
    state.aiPending = [];
    syncAckButton();
    renderAll();
    toast('AI changes marked as seen');
  } catch {
    toast('Could not reach the artisan server');
  }
});

async function tryServerBoot(): Promise<boolean> {
  try {
    const res = await fetch('/api/diagram');
    if (!res.ok) return false;
    const data = await res.json();
    if (!Array.isArray(data.nodes)) return false;
    serverRef.current = true;
    loadInto(data);
    await refreshPending();
    setInterval(refreshPending, 5000);
    return true;
  } catch {
    return false;
  }
}

interface EmbeddedPayload {
  diagram?: SerializedDiagram;
  pending?: PendingRef[];
}

const embedded: EmbeddedPayload | undefined = (window as unknown as { __ARTISAN__?: EmbeddedPayload }).__ARTISAN__;

async function boot(): Promise<void> {
  let fresh = true;
  if (embedded?.diagram && Array.isArray(embedded.diagram.nodes)) {
    loadInto(embedded.diagram);
    state.aiPending = Array.isArray(embedded.pending) ? embedded.pending : [];
    fresh = false;
  } else {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(LS_KEY);
    } catch {
      /* storage unavailable */
    }
    if (raw) {
      try {
        loadInto(JSON.parse(raw));
        fresh = false;
      } catch {
        loadInto(seedData());
      }
    } else {
      loadInto(seedData());
    }
  }
  syncColorize();
  applyThemeIcon();
  selLines.value = state.edgeStyle;
  updateUndoButtons();
  syncAckButton();
  if (!serverRef.current) btnConnect.style.display = embedded ? '' : 'none';
  renderAll();
  if (fresh) fitView();
  else applyCam();
  setHint(DEFAULT_HINT);
  if (document.fonts?.ready) document.fonts.ready.then(() => renderAll());
  if (await tryServerBoot()) {
    renderAll();
    applyCam();
    btnConnect.style.display = 'none';
    toast('Synced with artisan server');
  }
}

boot();
