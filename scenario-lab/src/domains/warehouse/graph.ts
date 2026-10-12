import type { Layout } from './schema';

export interface PathGraph {
  /** Adjacency: node id → list of [neighbour id, distance in m]. */
  adjacency: Map<string, [string, number][]>;
  positions: Map<string, { x: number; y: number }>;
}

export function buildGraph(layout: Pick<Layout, 'nodes' | 'edges'>): PathGraph {
  const positions = new Map(layout.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
  const adjacency = new Map<string, [string, number][]>(layout.nodes.map((n) => [n.id, []]));
  for (const e of layout.edges) {
    const a = positions.get(e.from);
    const b = positions.get(e.to);
    if (!a || !b) continue; // reported by validation
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    adjacency.get(e.from)!.push([e.to, d]);
    adjacency.get(e.to)!.push([e.from, d]);
  }
  return { adjacency, positions };
}

/**
 * Shortest walkway distances (m) from `source` to every reachable node
 * (Dijkstra). Unreachable nodes are absent from the result.
 */
export function shortestDistances(graph: PathGraph, source: string): Map<string, number> {
  const dist = new Map<string, number>();
  if (!graph.adjacency.has(source)) return dist;
  dist.set(source, 0);
  const done = new Set<string>();
  // The graphs are small (tens to low hundreds of nodes), so a linear scan
  // for the next node is simpler than a heap and fast enough.
  for (;;) {
    let current: string | undefined;
    let best = Infinity;
    for (const [n, d] of dist) {
      if (!done.has(n) && d < best) {
        best = d;
        current = n;
      }
    }
    if (current === undefined) break;
    done.add(current);
    for (const [next, w] of graph.adjacency.get(current) ?? []) {
      const nd = best + w;
      if (nd < (dist.get(next) ?? Infinity)) dist.set(next, nd);
    }
  }
  return dist;
}

export function totalWalkwayLength(graph: PathGraph): number {
  let sum = 0;
  for (const list of graph.adjacency.values()) for (const [, d] of list) sum += d;
  return sum / 2;
}
