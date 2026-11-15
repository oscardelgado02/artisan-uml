// Search/filter state + element text extraction. Pure UI state: never
// serialized (storage.ts untouched). The matcher lives in search-core.mjs
// so the contract test can exercise it without a TS loader.
import { searchableText, tokenize } from './core.mjs';
import { state } from '../model';
import type { Member, UmlEdge, UmlNode } from '../model';

export interface Stop {
  kind: 'node' | 'member' | 'edge';
  id: string;
  nodeId?: string;
}

export const search = {
  query: '',
  nodeHits: new Set<string>(),
  memberHits: new Set<string>(),
  edgeHits: new Set<string>(),
  // nodes that must NOT be dimmed: node/member hits + endpoints of edge hits
  undimNodes: new Set<string>(),
  stops: [] as Stop[],
  idx: 0,
};

export const searchActive = (): boolean => search.query.trim().length > 0;

function memberText(m: Member): string {
  return searchableText([m.name, m.type, m.params, m.note, ...(m.mods ?? [])]);
}

function nodeText(n: Partial<UmlNode>): string {
  return searchableText([
    n.name,
    n.kind,
    (n as UmlNode).dir,
    n.note,
    ...(n.attributes ?? []).map(memberText),
    ...(n.methods ?? []).map(memberText),
  ]);
}

function edgeText(e: Partial<UmlEdge>): string {
  return searchableText([e.label, e.note]);
}

// Removed-node tombstones: searchable like normal nodes (whole-node text, one stop).
function ghostNodes(): Array<Partial<UmlNode> & { id: string }> {
  return state.aiPending
    .filter(r => r.type === 'node' && r.change === 'removed' && r.ghost && !state.nodes.some(n => n.id === r.id))
    .map(r => r.ghost as unknown as Partial<UmlNode> & { id: string });
}

// Removed-edge tombstones: searchable by label/note, highlighted like normal edges.
function ghostEdges(): Array<Partial<UmlEdge> & { id: string }> {
  return state.aiPending
    .filter(r => r.type === 'edge' && r.change === 'removed' && r.ghost && !state.edges.some(e => e.id === r.id))
    .map(r => r.ghost as unknown as Partial<UmlEdge> & { id: string });
}

export function computeSearch(query: string): void {
  search.query = query;
  search.nodeHits.clear();
  search.memberHits.clear();
  search.edgeHits.clear();
  search.undimNodes.clear();
  search.stops = [];
  search.idx = 0;
  if (!searchActive()) return;

  const tokens = tokenize(query);
  const nodeMatch = (text: string) => tokens.every(t => text.includes(t));

  for (const n of state.nodes) {
    const text = nodeText(n);
    if (nodeMatch(text)) {
      search.nodeHits.add(n.id);
      search.stops.push({ kind: 'node', id: n.id });
    }
    for (const m of [...n.attributes, ...n.methods]) {
      if (nodeMatch(memberText(m))) {
        search.memberHits.add(m.id);
        search.stops.push({ kind: 'member', id: m.id, nodeId: n.id });
      }
    }
  }
  for (const g of ghostNodes()) {
    if (nodeMatch(nodeText(g))) {
      search.nodeHits.add(g.id);
      search.stops.push({ kind: 'node', id: g.id });
    }
  }
  const edges = [...state.edges, ...ghostEdges()];
  for (const e of edges) {
    if (nodeMatch(edgeText(e))) {
      search.edgeHits.add(e.id);
      search.stops.push({ kind: 'edge', id: e.id });
      if (e.from) search.undimNodes.add(e.from);
      if (e.to) search.undimNodes.add(e.to);
    }
  }

  // nodes with member hits stay un-dimmed too
  for (const s of search.stops) {
    if (s.kind === 'member' && s.nodeId) search.undimNodes.add(s.nodeId);
  }
}
