export interface LayoutNode {
  id: string;
  name?: string;
  width: number;
  height: number;
  x: number;
  y: number;
}
export interface LayoutEdge {
  from: string;
  to: string;
  kind?: string;
}
export function layeredLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  opts?: { nodesep?: number; ranksep?: number }
): void;
