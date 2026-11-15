export function toChunks<Item>(items: readonly Item[]): Item[][] {
  const chunks: Item[][] = [];

  for (let start = 0; start < items.length; start += 400) {
    chunks.push(items.slice(start, start + 400));
  }

  return chunks;
}
