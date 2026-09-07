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
import type { EdgeKind, NodeKind } from './model';
import {
  applyCam,
  anchor,
  fitView,
  nodesLayer,
  onBorder,
  renderAll,
  renderEdges,
  renderNodes,
  svgEl,
  syncColorize,
  syncRelSelect,
  toCanvas,
  updateSelectionStyles,
  viewCenter,
  zoomAt,
  wrap,
} from './render';
import type { UmlNode } from './model';
import {
  LS_KEY,
  loadInto,
  pushPre,
  redo,
  save,
  saveThrottled,
  seedData,
  undo,
  updateUndoButtons,
} from './storage';
import {
  DEFAULT_HINT,
  activeMenuRef,
  activePopoverRef,
  closePopovers,
  openEdgeEditor,
  openMemberEditor,
  openMenu,
  setHint,
  startRename,
  toast,
} from './editors';
import { copyPlantUML, downloadPlantUML, exportJSON, importJSONFile } from './exporters';
import type { MenuEntry, MenuItem } from './types';

const btnAddNode = document.getElementById('btn-add-node') as HTMLButtonElement;
const relSelect = document.getElementById('rel-select') as HTMLSelectElement;
const btnColorize = document.getElementById('btn-colorize') as HTMLButtonElement;
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
let downNode: string | null = null;
let relDrag: { from: string; sx: number; sy: number; moved: boolean } | null = null;
let ghostLine: SVGLineElement | null = null;
let suppressNodeCtx = false;

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

function linkStep(nodeId: string): void {
  if (!state.pendingFrom) {
    state.pendingFrom = nodeId;
    if (!state.linkKind) {
      state.linkKind = 'association';
      syncRelSelect();
    }
    setHint(
      `Linking ${EDGE_KINDS[state.linkKind].label}: click the target node — click the same node again for a self-relation (Esc to cancel)`
    );
    renderNodes();
  } else {
    const from = state.pendingFrom;
    state.pendingFrom = null;
    createEdge(from, nodeId, state.linkKind ?? 'association');
    setHint(
      `Linking ${EDGE_KINDS[state.linkKind ?? 'association'].label}: click the source node, then the target node (Esc to cancel)`
    );
    renderNodes();
  }
}

function cancelLinkMode(): void {
  if (!state.linkKind && !state.pendingFrom) return;
  state.linkKind = null;
  state.pendingFrom = null;
  syncRelSelect();
  setHint(DEFAULT_HINT);
  renderAll();
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
    '-',
    { label: attrLabel, action: () => addMember(nodeId, 'attributes') },
    ...(n && n.kind !== 'enum' ? [{ label: 'Add method', action: () => addMember(nodeId, 'methods') } as MenuItem] : []),
    '-',
    { label: 'Set kind', sub: kindMenuEntries(kind => changeKind(nodeId, kind)) },
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

function updateGhost(e: MouseEvent): void {
  const from = relDrag ? nodeById(relDrag.from) : null;
  if (!from) return;
  if (!ghostLine) {
    ghostLine = svgEl('line') as SVGLineElement;
    ghostLine.setAttribute('class', 'ghost-line');
    (document.querySelector<SVGGElement>('#link-ghost') as SVGGElement).appendChild(ghostLine);
  }
  const c = toCanvas(e.clientX, e.clientY);
  const p = onBorder(from, c.x, c.y) ? c : anchor(from, { x: c.x - 1, y: c.y - 1, _w: 2, _h: 2 } as UmlNode);
  ghostLine.setAttribute('x1', String(p.x));
  ghostLine.setAttribute('y1', String(p.y));
  ghostLine.setAttribute('x2', String(c.x));
  ghostLine.setAttribute('y2', String(c.y));
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
  if (e.button === 2) {
    const nodeEl = target.closest('.node');
    if (nodeEl && !state.linkKind) {
      relDrag = { from: nodeEl.getAttribute('data-id') ?? '', sx: e.clientX, sy: e.clientY, moved: false };
      e.preventDefault();
    }
    return;
  }
  if (e.button !== 0) return;
  const nodeEl = target.closest('.node');
  if (nodeEl) {
    const id = nodeEl.getAttribute('data-id') ?? '';
    const n = nodeById(id);
    if (!n) return;
    const p = toCanvas(e.clientX, e.clientY);
    if (state.linkKind || onBorder(n, p.x, p.y)) {
      downNode = id;
    } else {
      drag = { id, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, moved: false };
    }
  } else {
    pan = { sx: e.clientX, sy: e.clientY, cx: state.cam.x, cy: state.cam.y };
    wrap.classList.add('grabbing');
  }
});

document.addEventListener('mousemove', (e: MouseEvent) => {
  if (relDrag) {
    if (!relDrag.moved && Math.hypot(e.clientX - relDrag.sx, e.clientY - relDrag.sy) < 4) return;
    relDrag.moved = true;
    updateGhost(e);
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
  if (e.button === 2) {
    if (relDrag) {
      const { from, moved } = relDrag;
      relDrag = null;
      removeGhost();
      if (moved) {
        suppressNodeCtx = true;
        const drop = document.elementFromPoint(e.clientX, e.clientY)?.closest('.node');
        const to = drop?.getAttribute('data-id') ?? '';
        if (to) openRelKindMenu(from, to, e.clientX, e.clientY);
      }
    }
    return;
  }
  if (pan) {
    const moved = Math.hypot(e.clientX - pan.sx, e.clientY - pan.sy) > 3;
    wrap.classList.remove('grabbing');
    pan = null;
    saveThrottled();
    if (moved) return;
    if (state.linkKind || state.pendingFrom) {
      cancelLinkMode();
      return;
    }
    if (
      !drag &&
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
  if (!drag) {
    if (downNode) {
      linkStep(downNode);
      downNode = null;
    }
    return;
  }
  const wasDrag = drag.moved;
  const id = drag.id;
  drag = null;
  if (wasDrag) {
    saveThrottled();
    return;
  }
  if (state.linkKind || state.pendingFrom) {
    linkStep(id);
  } else {
    state.selected = { type: 'node', id };
    updateSelectionStyles();
  }
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
  if (state.linkKind) return;
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
  if (suppressNodeCtx) {
    suppressNodeCtx = false;
    return;
  }
  if (state.linkKind) {
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
  if (!g || state.linkKind) return;
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
  if (suppressNodeCtx) {
    suppressNodeCtx = false;
    return;
  }
  edgeMenu(g.getAttribute('data-id') ?? '', e.clientX, e.clientY);
});

wrap.addEventListener('contextmenu', (e: MouseEvent) => {
  const target = e.target as Element;
  if (target.closest('.node') || target.closest('.edge-g')) return;
  e.preventDefault();
  if (suppressNodeCtx) {
    suppressNodeCtx = false;
    return;
  }
  if (state.linkKind) {
    cancelLinkMode();
    return;
  }
  canvasMenu(e.clientX, e.clientY);
});

let cursorNode: Element | null = null;

nodesLayer.addEventListener('mousemove', (e: MouseEvent) => {
  if (drag || relDrag || state.linkKind) return;
  const nodeEl = (e.target as Element).closest('.node');
  if (cursorNode && cursorNode !== nodeEl) {
    (cursorNode as HTMLElement).style.cursor = '';
    cursorNode = null;
  }
  if (!nodeEl) return;
  const n = nodeById(nodeEl.getAttribute('data-id') ?? '');
  const p = toCanvas(e.clientX, e.clientY);
  const cross = !!n && onBorder(n, p.x, p.y);
  (nodeEl as HTMLElement).style.cursor = cross ? 'crosshair' : '';
  if (cross) cursorNode = nodeEl;
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
    if (relDrag) {
      relDrag = null;
      removeGhost();
    }
    downNode = null;
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

relSelect.addEventListener('change', () => {
  const v = relSelect.value;
  state.linkKind = (v || null) as EdgeKind | null;
  state.pendingFrom = null;
  syncRelSelect();
  setHint(
    v
      ? `Linking ${EDGE_KINDS[v as EdgeKind].label}: click a node, then the target node — click the same node for a self-relation (Esc to cancel)`
      : DEFAULT_HINT
  );
  renderAll();
});

btnColorize.addEventListener('click', () => {
  state.colorize = !state.colorize;
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

function boot(): void {
  const raw = localStorage.getItem(LS_KEY);
  let fresh = true;
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
  syncColorize();
  syncRelSelect();
  applyThemeIcon();
  updateUndoButtons();
  renderAll();
  if (fresh) fitView();
  else applyCam();
  setHint(DEFAULT_HINT);
  if (document.fonts?.ready) document.fonts.ready.then(() => renderEdges());
}

boot();
