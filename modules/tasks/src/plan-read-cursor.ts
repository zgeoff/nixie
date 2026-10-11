// Moves a task's read cursor over the contiguous run of inbox records the step acknowledged,
// oldest first, and stops at the first one it did not. A record acknowledged past that gap stays
// unread, so a step that crashed before commit, or skipped one, sees the rest again.
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
