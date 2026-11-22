export interface PartOfEdge {
  readonly from: string;
  readonly to: string;
}

// Whether adding `from` part-of `to` closes a loop: `to` already reaches `from` through part-of
// links that exist.
export function isPartOfCycle(edges: readonly PartOfEdge[], added: PartOfEdge): boolean {
  const seen = new Set<string>();

  const queue = [added.to];

  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    if (next === added.from) {
      return true;
    }

    if (seen.has(next)) {
      continue;
    }

    seen.add(next);

    for (const edge of edges) {
      if (edge.from === next) {
        queue.push(edge.to);
      }
    }
  }

  return false;
}
