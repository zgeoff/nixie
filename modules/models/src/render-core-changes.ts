import type { MemoryItem, MemoryRef } from './types';

// Renders the body of the note on the turn after the pinned core changed, so the model stops
// repeating an old value. Each item shows by its short ID, an unpinned one by its entry in shortIDs.
// It renders nothing with no last turn to compare, or when the core is unchanged.
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
    'The pinned memory changed since your last turn. Where these differ from the pinned memory this session opened with, or from anything said earlier, these hold.',
    ...lines,
  ].join('\n');
}
