export function planReadCursor(
  unread: readonly number[],
  cursor: number,
  acknowledged: readonly number[],
): number {
  const read = new Set(acknowledged);

  const first = unread.findIndex((sequence) => !read.has(sequence));
  const lastRead = first === -1 ? unread.at(-1) : unread[first - 1];

  return lastRead ?? cursor;
}
