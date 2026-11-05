// How near an item sits to messages in general: the mean similarity of its nearest background
// messages. A vague item sits near many messages and so scores high, which is what lets a correction
// tell a hub from an item that matches this one message well. It needs no change to the item, so it
// keeps working as the store grows.
export function buildHubScore(similarities: readonly number[], nearest: number): number {
  const top = similarities.toSorted((first, second) => second - first).slice(0, nearest);

  return top.length === 0 ? 0 : top.reduce((sum, value) => sum + value, 0) / top.length;
}
