import { state } from './model';
import type { Camera, EdgeStyle, UmlEdge, UmlNode } from './model';
import { applyCam, renderAll, syncColorize } from './render';

export const LS_KEY = 'wise-uml-v1';

let past: string[] = [];
let future: string[] = [];

export const pendingPre: { current: string | null } = { current: null };

export interface SerializedDiagram {
  seq?: number;
  nodes: UmlNode[];
  edges: UmlEdge[];
  colorize?: boolean;
  cam?: Camera | null;
  projectNotes?: string;
  edgeStyle?: string;
}

export const serverRef: { current: boolean } = { current: false };
export const fileRef: { handle: any } = { handle: null };

export function serialize(): string {
  const diagram: SerializedDiagram = {
    seq: state.seq,
    nodes: state.nodes.map(({ _w, _h, ...n }) => n),
    edges: state.edges.map(e => ({ ...e })),
    colorize: state.colorize,
    cam: state.cam,
    projectNotes: state.projectNotes,
    edgeStyle: state.edgeStyle,
  };
  return JSON.stringify(diagram);
}

export function save(): void {
  try {
    localStorage.setItem(LS_KEY, serialize());
  } catch {
    /* storage unavailable (file:// may throw) */
  }
  if (serverRef.current) putToServer();
  if (fileRef.handle) saveFileThrottled();
}

let putTimer: ReturnType<typeof setTimeout> | null = null;

function putToServer(): void {
  if (putTimer) return;
  putTimer = setTimeout(() => {
    putTimer = null;
    fetch('/api/diagram', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: serialize() }).catch(
      () => undefined
    );
  }, 500);
}

let fileTimer: ReturnType<typeof setTimeout> | null = null;

function saveFileThrottled(): void {
  if (fileTimer) return;
  fileTimer = setTimeout(() => {
    fileTimer = null;
    fileRef.handle
      .createWritable()
      .then(async (w: any) => {
        await w.write(serialize());
        await w.close();
      })
      .catch(() => undefined);
  }, 500);
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function saveThrottled(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    save();
  }, 250);
}

export function loadInto(data: SerializedDiagram): void {
  state.seq = data.seq ?? 1;
  state.nodes = Array.isArray(data.nodes) ? data.nodes : [];
  state.edges = Array.isArray(data.edges) ? data.edges : [];
  state.colorize = !!data.colorize;
  state.projectNotes = typeof data.projectNotes === 'string' ? data.projectNotes : '';
  const es = data.edgeStyle;
  state.edgeStyle = typeof es === 'string' && (['ortho', 'smooth', 'straight', 'elliptic'] as string[]).includes(es) ? (es as EdgeStyle) : 'straight';
  state.cam =
    data.cam && typeof data.cam.z === 'number'
      ? { ...data.cam }
      : { x: 0, y: 0, z: 1 };
  state.selected = null;
  state.linkFrom = null;
  state.linkPoint = null;
  state.linkKind = null;
  for (const n of state.nodes) {
    if (!Array.isArray(n.attributes)) n.attributes = [];
    if (!Array.isArray(n.methods)) n.methods = [];
  }
}

function commitPre(pre: string): void {
  past.push(pre);
  if (past.length > 60) past.shift();
  future = [];
  pendingPre.current = null;
  updateUndoButtons();
}

export function pushPre(): void {
  commitPre(serialize());
}

export function consumePendingPre(): void {
  if (pendingPre.current) commitPre(pendingPre.current);
}

export function updateUndoButtons(): void {
  const u = document.getElementById('btn-undo') as HTMLButtonElement | null;
  const r = document.getElementById('btn-redo') as HTMLButtonElement | null;
  if (u) u.disabled = past.length === 0;
  if (r) r.disabled = future.length === 0;
}

export function undo(): void {
  if (!past.length) return;
  future.push(serialize());
  loadInto(JSON.parse(past.pop() as string) as SerializedDiagram);
  syncColorize();
  renderAll();
  applyCam();
  save();
  updateUndoButtons();
}

export function redo(): void {
  if (!future.length) return;
  past.push(serialize());
  loadInto(JSON.parse(future.pop() as string) as SerializedDiagram);
  syncColorize();
  renderAll();
  applyCam();
  save();
  updateUndoButtons();
}

export function seedData(): SerializedDiagram {
  const nodes: UmlNode[] = [
    {
      id: 'n1',
      kind: 'abstract',
      name: 'Animal',
      x: 60,
      y: 80,
      attributes: [
        { id: 'a1', vis: '#', name: 'Name', type: 'string', mods: [], params: null },
        { id: 'a2', vis: '#', name: 'Age', type: 'int', mods: [], params: null },
      ],
      methods: [{ id: 'm1', vis: '+', name: 'Speak', type: 'void', mods: ['abstract'], params: '' }],
    },
    {
      id: 'n2',
      kind: 'interface',
      name: 'IPet',
      x: 520,
      y: 60,
      attributes: [{ id: 'a3', vis: '+', name: 'Name', type: 'string', mods: [], params: null }],
      methods: [{ id: 'm2', vis: '+', name: 'Play', type: 'void', mods: [], params: '' }],
    },
    {
      id: 'n3',
      kind: 'class',
      name: 'Dog',
      x: 260,
      y: 330,
      attributes: [{ id: 'a4', vis: '-', name: 'energy', type: 'int', mods: ['readonly'], params: null }],
      methods: [
        { id: 'm3', vis: '+', name: 'Speak', type: 'void', mods: ['override'], params: '' },
        { id: 'm4', vis: '+', name: 'Fetch', type: 'void', mods: [], params: '' },
        { id: 'm5', vis: '+', name: 'ToString', type: 'string', mods: ['override'], params: '' },
      ],
    },
    {
      id: 'n4',
      kind: 'class',
      name: 'Cat',
      x: 30,
      y: 360,
      attributes: [{ id: 'a5', vis: '-', name: 'livesLeft', type: 'int', mods: [], params: null }],
      methods: [{ id: 'm6', vis: '+', name: 'Speak', type: 'void', mods: ['override'], params: '' }],
    },
    {
      id: 'n5',
      kind: 'class',
      name: 'Owner',
      x: 590,
      y: 350,
      attributes: [
        { id: 'a6', vis: '-', name: 'pets', type: 'List<IPet>', mods: ['readonly'], params: null },
      ],
      methods: [{ id: 'm7', vis: '+', name: 'Adopt', type: 'void', mods: [], params: 'pet: IPet' }],
    },
    {
      id: 'n6',
      kind: 'enum',
      name: 'Mood',
      x: 850,
      y: 130,
      attributes: [
        { id: 'a7', vis: '-', name: 'Happy', type: '', mods: [], params: null },
        { id: 'a8', vis: '-', name: 'Sleepy', type: '', mods: [], params: null },
        { id: 'a9', vis: '-', name: 'Zoomies', type: '', mods: [], params: null },
      ],
      methods: [],
    },
  ];
  const edges: UmlEdge[] = [
    { id: 'e1', kind: 'inheritance', from: 'n3', to: 'n1', label: '', fromMult: '', toMult: '' },
    { id: 'e2', kind: 'inheritance', from: 'n4', to: 'n1', label: '', fromMult: '', toMult: '' },
    { id: 'e3', kind: 'realization', from: 'n3', to: 'n2', label: '', fromMult: '', toMult: '' },
    { id: 'e4', kind: 'composition', from: 'n5', to: 'n3', label: 'owns', fromMult: '1', toMult: '0..*' },
    { id: 'e5', kind: 'association', from: 'n3', to: 'n6', label: 'mood', fromMult: '', toMult: '' },
  ];
  return { seq: 100, nodes, edges, colorize: false, cam: null };
}
