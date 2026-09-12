export const SVG_NS = 'http://www.w3.org/2000/svg';

export type NodeKind = 'class' | 'abstract' | 'interface' | 'enum' | 'record' | 'struct';

export type EdgeKind =
  | 'association'
  | 'inheritance'
  | 'realization'
  | 'dependency'
  | 'aggregation'
  | 'composition';

export type Visibility = '+' | '-' | '#' | '~';

export interface KindDef {
  label: string;
  stereo: string;
}

export const KINDS: Record<NodeKind, KindDef> = {
  class: { label: 'Class', stereo: '' },
  abstract: { label: 'Abstract class', stereo: 'abstract' },
  interface: { label: 'Interface', stereo: '\u00ABinterface\u00BB' },
  enum: { label: 'Enum', stereo: '\u00ABenum\u00BB' },
  record: { label: 'Record', stereo: '\u00ABrecord\u00BB' },
  struct: { label: 'Struct', stereo: '\u00ABstruct\u00BB' },
};

export interface EdgeDef {
  label: string;
  dashed: boolean;
  end: string;
  start: string | null;
}

export const EDGE_KINDS: Record<EdgeKind, EdgeDef> = {
  association: { label: 'Association', dashed: false, end: 'm-arrow', start: null },
  inheritance: { label: 'Inheritance (extends)', dashed: false, end: 'm-triangle', start: null },
  realization: { label: 'Realization (implements)', dashed: true, end: 'm-triangle', start: null },
  dependency: { label: 'Dependency', dashed: true, end: 'm-arrow', start: null },
  aggregation: { label: 'Aggregation (has-a)', dashed: false, end: 'm-arrow', start: 'm-diamond-hollow' },
  composition: { label: 'Composition (owns)', dashed: false, end: 'm-arrow', start: 'm-diamond-filled' },
};

export interface VisibilityDef {
  k: Visibility;
  label: string;
}

export const VISIBILITY: VisibilityDef[] = [
  { k: '+', label: 'public' },
  { k: '-', label: 'private' },
  { k: '#', label: 'protected' },
  { k: '~', label: 'internal' },
];

export const MODIFIERS: string[] = [
  'static',
  'abstract',
  'readonly',
  'virtual',
  'override',
  'sealed',
  'async',
  'const',
];

export interface Member {
  id: string;
  vis: Visibility;
  name: string;
  type: string;
  mods: string[];
  params: string | null;
  note?: string;
}

export interface UmlNode {
  id: string;
  kind: NodeKind;
  name: string;
  x: number;
  y: number;
  attributes: Member[];
  methods: Member[];
  note?: string;
  _w?: number;
  _h?: number;
}

export interface UmlEdge {
  id: string;
  kind: EdgeKind;
  from: string;
  to: string;
  label: string;
  fromMult: string;
  toMult: string;
  note?: string;
}

export interface PendingRef {
  type: 'node' | 'edge' | 'member';
  id: string;
  nodeId?: string;
  change: 'added' | 'modified' | 'removed';
  summary?: string;
}

export interface Camera {
  x: number;
  y: number;
  z: number;
}

export interface Selection {
  type: 'node' | 'edge';
  id: string;
}

export type EdgeStyle = 'straight' | 'ortho' | 'smooth' | 'elliptic';

export interface AppState {
  seq: number;
  nodes: UmlNode[];
  edges: UmlEdge[];
  linkFrom: string | null;
  linkPoint: { x: number; y: number } | null;
  linkKind: EdgeKind | null;
  selected: Selection | null;
  colorize: boolean;
  cam: Camera;
  projectNotes: string;
  aiPending: PendingRef[];
  edgeStyle: EdgeStyle;
}

export const state: AppState = {
  seq: 1,
  nodes: [],
  edges: [],
  linkFrom: null,
  linkPoint: null,
  linkKind: null,
  selected: null,
  colorize: false,
  cam: { x: 0, y: 0, z: 1 },
  projectNotes: '',
  aiPending: [],
  edgeStyle: 'straight',
};

export const isPending = (type: PendingRef['type'], id: string): boolean =>
  state.aiPending.some(r => r.type === type && r.id === id);

export const esc = (s: unknown): string =>
  String(s ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  );

export const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));

export const uid = (): string => 'n' + ++state.seq + '-' + Math.random().toString(36).slice(2, 7);

export const nodeById = (id: string): UmlNode | undefined => state.nodes.find(n => n.id === id);

export const edgeById = (id: string): UmlEdge | undefined => state.edges.find(e => e.id === id);

export type MemberSection = 'attributes' | 'methods';

export const memberKey = (n: UmlNode, mid: string): MemberSection =>
  n.attributes.some(m => m.id === mid) ? 'attributes' : 'methods';

export const findMember = (n: UmlNode, mid: string): Member | undefined =>
  n.attributes.find(m => m.id === mid) ?? n.methods.find(m => m.id === mid);

export const selNode = (id: string): boolean =>
  !!state.selected && state.selected.type === 'node' && state.selected.id === id;

export const selEdge = (id: string): boolean =>
  !!state.selected && state.selected.type === 'edge' && state.selected.id === id;
