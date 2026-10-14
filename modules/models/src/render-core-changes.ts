import type { MemoryItem, MemoryRef } from './types';

// Renders the note that goes before the message on the turn after the pinned core changed, so the
// model stops repeating an old value. Each item shows by its short ID, an unpinned one by its entry
// in shortIDs. It renders nothing before the first turn, or when the core is unchanged.
export function renderCoreChanges(
  previous: readonly MemoryRef[] | null,
  current: readonly MemoryItem[],
  shortIDs: ReadonlyMap<string, string>,
): string | null {
  if (previous === null) {
    return null;
  }
  const before = new Map(previous.map((ref) => [ref.itemID, ref.version]));
  const now = new Set(current.map((item) => item.itemID));
  const lines = [
    ...current.flatMap((item) => {
      const version = before.get(item.itemID);

      if (version === undefined) {
        return [`- Pinned [${item.shortID}]: ${item.text}`];
      }
      return version === item.version ? [] : [`- Changed [${item.shortID}]: ${item.text}`];
    }),
    ...previous
      .filter((ref) => !now.has(ref.itemID))
      .map((ref) => `- Unpinned [${shortIDs.get(ref.itemID) ?? ref.itemID}]`),
  ];

  if (lines.length === 0) {
    return null;
  }
  return [
    '<pinned-memory-changes>',
    'The pinned memory changed since your last turn, and the system prompt holds the current items. Where these differ from anything said earlier, these hold.',
    ...lines,
    '</pinned-memory-changes>',
  ].join('\n');
}
