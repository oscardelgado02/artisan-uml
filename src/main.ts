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
import type { EdgeKind, EdgeStyle, ImplSync, NodeKind } from './model';
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
  serverDiskRef,
  serverDiskRev,
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
import { acceptedKeys, rejectedKeys, refKey } from './model';

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
  wasSelected: boolean;
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
// True when the node under the last mouseup was already selected before that
// click — only then may a click on its name/members open an editor.
let nodeWasSelectedAtDown = false;

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
      const wasSelected = selNode(id);
      drag = { id, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, moved: false, wasSelected };
      nodeWasSelectedAtDown = wasSelected;
      if (!wasSelected) {
        state.selected = { type: 'node', id };
        updateSelectionStyles();
      }
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
  const wasSelected = drag.wasSelected;
  const id = drag.id;
  drag = null;
  if (wasDrag) {
    if (!wasSelected) {
      state.selected = null;
      updateSelectionStyles();
    }
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
  const nodeEl = (e.target as Element).closest('.node');
  if (!nodeEl) return;
  const id = nodeEl.getAttribute('data-id') ?? '';
  // Body of an unselected class only selects it — edit requires the class to
  // have been selected before this click. Add buttons stay always active.
  if (!nodeWasSelectedAtDown) {
    nodeWasSelectedAtDown = false;
    return;
  }
  nodeWasSelectedAtDown = false;
  const nameEl = (e.target as Element).closest('.node-name');
  if (nameEl) {
    startRename(id);
    return;
  }
  const memberEl = (e.target as Element).closest('.member');
  if (memberEl) {
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

const selPalette = document.getElementById('sel-palette') as HTMLSelectElement;
selPalette.value = document.documentElement.getAttribute('data-theme') ?? 'default';
selPalette.addEventListener('change', () => {
  const p = selPalette.value;
  if (p === 'default') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', p);
  localStorage.setItem('wise-uml-palette', p);
  renderAll();
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
const btnImpl = document.getElementById('btn-impl') as HTMLButtonElement;

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
    (document.getElementById('save-warn') as HTMLElement).hidden = true;
    toast('Connected — edits now autosave to your diagram.json');
  } catch {
    /* picker cancelled */
  }
});

function syncAckButton(): void {
  const count = state.aiPending.length;
  btnAck.style.display = count ? '' : 'none';
  btnAck.textContent = `Mark AI changes seen (${count})`;
  const btnReject = document.getElementById('btn-reject') as HTMLButtonElement | null;
  if (btnReject) {
    btnReject.style.display = count ? '' : 'none';
    btnReject.textContent = `Reject AI changes (${count})`;
  }
}

// Code-sync badge: shown while the code differs from the diagram (impl-diff).
// Hover explains what to do — run `artisan impl-diff`, then /artisan-implement.
function syncImplBadge(): void {
  const s = state.implSync;
  btnImpl.style.display = s?.changed ? '' : 'none';
  if (s?.changed) {
    const c = s.counts;
    const parts = c ? [`${c.missing} missing in code`, `${c.drift} not in diagram`, `${c.mismatch} signature mismatch${c.mismatch === 1 ? '' : 'es'}`] : [];
    btnImpl.title =
      'The code differs from the diagram. Run `artisan impl-diff` in your project ' +
      'to see the details, then /artisan-implement (or /artisan-scaffold) to update the code.' +
      (parts.length ? ` (${parts.join(', ')})` : '');
  }
}

async function refreshImplDiff(): Promise<void> {
  try {
    const res = await fetch('/api/impl');
    if (!res.ok) return;
    const data = (await res.json()) as ImplSync;
    const before = JSON.stringify(state.implSync);
    state.implSync = data;
    if (JSON.stringify(data) !== before) syncImplBadge();
  } catch {
    /* offline */
  }
}

// Diff a freshly read disk diagram against the one the editor last saw;
// anything new (nodes, members, relations) becomes a pending ref so it
// renders amber until the human marks it seen.
function freshDiskRefs(prev: SerializedDiagram, cur: SerializedDiagram): PendingRef[] {
  const refs: PendingRef[] = [];
  const prevNodes = new Map((prev.nodes || []).map(n => [n.id, n]));
  for (const n of cur.nodes || []) {
    const before = prevNodes.get(n.id);
    if (!before) {
      refs.push({ type: 'node', id: n.id, change: 'added', summary: `new ${n.kind} ${n.name}` });
      continue;
    }
    const had = new Set(
      [...(before.attributes || []), ...(before.methods || [])].map(m => m.id)
    );
    for (const m of [...(n.attributes || []), ...(n.methods || [])]) {
      if (!had.has(m.id)) refs.push({ type: 'member', id: m.id, nodeId: n.id, change: 'added', summary: `${n.name}: + ${m.name}` });
    }
  }
  for (const n of prevNodes.values()) {
    if (!(cur.nodes || []).some(c => c.id === n.id)) {
      refs.push({ type: 'node', id: n.id, change: 'removed', summary: `removed class ${n.name}`, ghost: n as unknown as Record<string, unknown> });
    }
    const has = new Set([...(n.attributes || []), ...(n.methods || [])].map(m => m.id));
    const now = cur.nodes?.find(c => c.id === n.id);
    if (now) {
      for (const m of [...(n.attributes || []), ...(n.methods || [])]) {
        if (!now.attributes?.some(c => c.id === m.id) && !now.methods?.some(c => c.id === m.id)) {
          refs.push({ type: 'member', id: m.id, nodeId: n.id, change: 'removed', summary: `${n.name}: removed ${m.name}`, ghost: { nodeId: n.id, member: m } });
        }
      }
      void has;
    }
  }
  const prevEdges = new Map((prev.edges || []).map(e => [e.id, e]));
  for (const e of cur.edges || []) {
    if (!prevEdges.has(e.id)) refs.push({ type: 'edge', id: e.id, change: 'added', summary: `new relation ${e.from} → ${e.to}` });
  }
  for (const e of prevEdges.values()) {
    if (!(cur.edges || []).some(c => c.id === e.id)) {
      const nameOf = (id: string) => prevNodes.get(id)?.name ?? id;
      refs.push({
        type: 'edge',
        id: e.id,
        change: 'removed',
        summary: `removed relation ${nameOf(e.from)} → ${nameOf(e.to)}`,
        ghost: { ...e, fromName: nameOf(e.from), toName: nameOf(e.to) },
      });
    }
  }
  return refs;
}

async function refreshPending(): Promise<void> {
  try {
    // external diagram changes (CLI add/edit/remove while serving)
    const diskRes = await fetch('/api/diagram');
    if (diskRes.ok && serverDiskRef.current) {
      const disk = (await diskRes.json()) as SerializedDiagram;
      serverDiskRev.current = Number(diskRes.headers.get('X-Artisan-Rev')) || serverDiskRev.current;
      if (Array.isArray(disk.nodes)) {
        const fresh = freshDiskRefs(serverDiskRef.current, disk);
        serverDiskRef.current = disk;
        if (fresh.length) {
          loadInto(disk);
          const known = new Set(state.aiPending.map(r => `${r.type}:${r.id}:${r.change}`));
          const unseen = fresh.filter(r => !known.has(`${r.type}:${r.id}:${r.change}`));
          state.aiPending = [...state.aiPending, ...unseen];
          syncAckButton();
          renderAll();
          toast('Diagram changed on disk — new items highlighted');
          // persist the refs server-side so they survive a page reload
          if (unseen.length) {
            void fetch('/api/pending', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refs: unseen }),
            }).catch(() => undefined);
          }
        }
      }
    }
    const res = await fetch('/api/pending');
    if (!res.ok) return;
    const data = (await res.json()) as { refs?: PendingRef[] } | PendingRef[];
    const refs = Array.isArray(data) ? data : Array.isArray(data.refs) ? data.refs : [];
    const visible = refs.filter(r => !acceptedKeys.has(refKey(r)));
    const diskNew = state.aiPending.filter(
      r => !refs.some(p => p.type === r.type && p.id === r.id && p.change === r.change)
    );
    const merged = [...visible, ...diskNew.filter(r => !acceptedKeys.has(refKey(r)))];
    if (JSON.stringify(merged) !== JSON.stringify(state.aiPending)) {
      state.aiPending = merged;
      syncAckButton();
      renderAll();
    }
  } catch {
    /* offline */
  }
}

// Accept one pending ref: editor drops it immediately, server gets it for
// pending.json; embedded mode persists the accepted key in localStorage.
async function acceptRef(key: string): Promise<void> {
  acceptedKeys.add(key);
  if (embedded) persistAccepted();
  state.aiPending = state.aiPending.filter(r => refKey(r) !== key);
  syncAckButton();
  renderAll();
  if (serverRef.current) {
    try {
      const res = await fetch('/api/ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: [key] }),
      });
      if (!res.ok) throw new Error('not ok');
    } catch {
      toast('Could not reach the artisan server');
    }
  }
}
window.addEventListener('artisan-accept', ev => {
  void acceptRef((ev as CustomEvent<string>).detail);
});

// Embedded (no server) revert: apply the inverse of a pending ref to the
// in-memory diagram — same semantics as the CLI's runReject.
function applyRevert(r: PendingRef): void {
  const g = (r.ghost ?? {}) as Record<string, any>;
  if (r.change === 'added') {
    if (r.type === 'node') {
      state.nodes = state.nodes.filter(n => n.id !== r.id);
      state.edges = state.edges.filter(e => e.from !== r.id && e.to !== r.id);
    } else if (r.type === 'member') {
      const n = state.nodes.find(x => x.id === (g.nodeId || r.nodeId));
      if (n) {
        n.attributes = (n.attributes || []).filter(m => m.id !== r.id);
        n.methods = (n.methods || []).filter(m => m.id !== r.id);
      }
    } else if (r.type === 'edge') {
      state.edges = state.edges.filter(e => e.id !== r.id);
    }
  } else if (r.change === 'modified') {
    if (r.type === 'node') {
      const n = state.nodes.find(x => x.id === r.id || x.name === r.id);
      if (n) {
        if (g.name) n.name = g.name;
        if (g.kind) n.kind = g.kind;
      }
    } else if (g.member) {
      const n = state.nodes.find(x => x.id === (g.nodeId || r.nodeId));
      if (!n) return;
      n.attributes = (n.attributes || []).filter(m => m.id !== r.id && m.id !== g.removeId);
      n.methods = (n.methods || []).filter(m => m.id !== r.id && m.id !== g.removeId);
      const restored = { ...g.member, id: r.id };
      if (restored.params != null) n.methods = [...n.methods, restored];
      else n.attributes = [...n.attributes, restored];
    }
  } else if (r.change === 'removed') {
    if (r.type === 'node' && g.id) {
      state.nodes.push({
        id: g.id,
        kind: g.kind || 'class',
        name: g.name || g.id,
        note: g.note || '',
        x: g.x ?? 200,
        y: g.y ?? 200,
        attributes: g.attributes || [],
        methods: g.methods || [],
      } as never);
    } else if (r.type === 'member' && g.member) {
      const n = state.nodes.find(x => x.id === g.nodeId);
      if (!n) return;
      const restored = { ...g.member, id: r.id };
      if (restored.params != null) n.methods = [...n.methods, restored];
      else n.attributes = [...n.attributes, restored];
    } else if (r.type === 'edge' && g.from) {
      state.edges.push({
        id: r.id,
        kind: g.kind || 'association',
        from: g.from,
        to: g.to,
        label: g.label || '',
        fromMult: g.fromMult || '',
        toMult: g.toMult || '',
        note: g.note || '',
      } as never);
    }
  }
}

async function rejectRefs(keys: string[]): Promise<void> {
  const targets = state.aiPending.filter(r => keys.includes(refKey(r)));
  for (const k of keys) rejectedKeys.add(k);
  if (embedded) {
    try {
      localStorage.setItem('artisan-rejected-keys', JSON.stringify([...rejectedKeys]));
    } catch {
      /* storage unavailable */
    }
    for (const r of targets) applyRevert(r);
    save();
  } else if (serverRef.current) {
    try {
      const res = await fetch('/api/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys }),
      });
      if (!res.ok) throw new Error('not ok');
      const data = (await res.json()) as { diagram?: SerializedDiagram };
      if (data.diagram && Array.isArray(data.diagram.nodes)) {
        loadInto(data.diagram);
        serverDiskRef.current = data.diagram;
      }
    } catch {
      toast('Could not reach the artisan server');
    }
  }
  state.aiPending = state.aiPending.filter(r => !keys.includes(refKey(r)));
  syncAckButton();
  renderAll();
}
window.addEventListener('artisan-reject', ev => {
  void rejectRefs([(ev as CustomEvent<string>).detail]);
});

btnAck.addEventListener('click', async () => {
  if (!serverRef.current) {
    toast('Run `artisan ack` in your project to confirm');
    return;
  }
  try {
    const res = await fetch('/api/ack', { method: 'POST' });
    if (!res.ok) return;
    for (const r of state.aiPending) acceptedKeys.add(refKey(r));
    persistAccepted();
    state.aiPending = [];
    syncAckButton();
    renderAll();
    toast('AI changes marked as seen');
  } catch {
    toast('Could not reach the artisan server');
  }
});

// Global reject: full revert (last human state) via server, or local inverse
// of every pending ref in embedded mode.
const btnReject = document.getElementById('btn-reject') as HTMLButtonElement | null;
btnReject?.addEventListener('click', async () => {
  if (!state.aiPending.length) return;
  const all = state.aiPending.map(refKey);
  if (serverRef.current) {
    await rejectRefs([]);
  } else if (embedded) {
    await rejectRefs(all);
  } else {
    toast('Run `artisan reject` in your project to revert');
    return;
  }
  toast('AI changes rejected — diagram reverted');
});

function persistAccepted(): void {
  if (!embedded) return;
  try {
    localStorage.setItem('artisan-accepted-keys', JSON.stringify([...acceptedKeys]));
  } catch {
    /* storage unavailable */
  }
}

async function tryServerBoot(): Promise<boolean> {
  try {
    const res = await fetch('/api/diagram');
    if (!res.ok) return false;
    const data = await res.json();
    if (!Array.isArray(data.nodes)) return false;
    serverRef.current = true;
    loadInto(data);
    serverDiskRef.current = data;
    serverDiskRev.current = Number(res.headers.get('X-Artisan-Rev')) || serverDiskRev.current;
    await refreshPending();
    setInterval(refreshPending, 5000);
    void refreshImplDiff();
    setInterval(refreshImplDiff, 30000);
    return true;
  } catch {
    return false;
  }
}

interface EmbeddedPayload {
  diagram?: SerializedDiagram;
  pending?: PendingRef[];
  implDiff?: ImplSync | null;
}

const embedded: EmbeddedPayload | undefined = (window as unknown as { __ARTISAN__?: EmbeddedPayload }).__ARTISAN__;

async function boot(): Promise<void> {
  let fresh = true;
  if (embedded?.diagram && Array.isArray(embedded.diagram.nodes)) {
    loadInto(embedded.diagram);
    state.aiPending = Array.isArray(embedded.pending) ? embedded.pending : [];
    state.implSync = embedded.implDiff ?? null;
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
  // embedded mode: individually accepted refs were persisted locally
  if (embedded) {
    try {
      const saved = JSON.parse(localStorage.getItem('artisan-accepted-keys') ?? '[]') as string[];
      for (const k of saved) acceptedKeys.add(k);
      state.aiPending = state.aiPending.filter(r => !acceptedKeys.has(refKey(r)));
    } catch {
      /* storage unavailable */
    }
    try {
      const savedRej = JSON.parse(localStorage.getItem('artisan-rejected-keys') ?? '[]') as string[];
      for (const k of savedRej) rejectedKeys.add(k);
      state.aiPending = state.aiPending.filter(r => !rejectedKeys.has(refKey(r)));
    } catch {
      /* storage unavailable */
    }
  }
  syncColorize();
  applyThemeIcon();
  selLines.value = state.edgeStyle;
  updateUndoButtons();
  syncAckButton();
  syncImplBadge();
  if (embedded && !serverRef.current) {
    btnConnect.style.display = '';
    (document.getElementById('save-warn') as HTMLElement).hidden = false;
  }
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

// Stale-tab save was rejected by the server (rev mismatch): disk wins.
window.addEventListener('artisan-disk-conflict', ((e: CustomEvent<SerializedDiagram>) => {
  if (e.detail?.nodes) {
    loadInto(e.detail);
    renderAll();
    toast('Diagram changed on disk — reloaded; your edit was not saved');
  }
}) as EventListener);

boot();
