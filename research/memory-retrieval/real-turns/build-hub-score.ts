// A vague item sits near many messages and so scores high, which lets a correction tell a hub from
// an item that matches this one message well, with no change to the item as the store grows.
export function buildHubScore(similarities: readonly number[], nearest: number): number {
  const top = similarities.toSorted((first, second) => second - first).slice(0, nearest);

  return top.length === 0 ? 0 : top.reduce((sum, value) => sum + value, 0) / top.length;
}
