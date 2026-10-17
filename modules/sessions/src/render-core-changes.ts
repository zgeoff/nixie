import { renderMemoryItem } from './render-memory-item';
import type { MemoryItem, MemoryLineOptions, MemoryRef } from './types';

// How the change note renders: each item's line options, and the short ID of each unpinned item.
export interface CoreChangeOptions extends MemoryLineOptions {
  readonly unpinnedShortIDs: ReadonlyMap<string, string>;
}

// a pinned item as the note reads it; a self-note is never pinned, so its kind and model never show
type PinnedItem = Omit<MemoryItem, 'kind' | 'model'>;

// Renders the body of the note on the turn after the pinned core changed, so the model stops
// repeating an old value. A pinned or changed item shows whole, with the line that says where it came
// from; an unpinned one shows by its short ID. It renders nothing with no last turn, or no change.
export function renderCoreChanges(
  previous: readonly MemoryRef[] | null,
  current: readonly PinnedItem[],
  options: CoreChangeOptions,
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
        return renderChangedItem('Pinned', item, options);
      }

      return version === item.version ? [] : renderChangedItem('Changed', item, options);
    }),
    ...previous
      .filter((ref) => !now.has(ref.itemID))
      .map((ref) => `- Unpinned [${options.unpinnedShortIDs.get(ref.itemID) ?? ref.itemID}]`),
  ];

  if (lines.length === 0) {
    return null;
  }

  return [
    'The pinned memory changed since your last turn. Where these differ from the pinned memory this session opened with, or from anything said earlier, these hold.',
    ...lines,
  ].join('\n');
}

// the item as the pinned memory renders it, under a line that names its change
function renderChangedItem(
  label: 'Pinned' | 'Changed',
  item: PinnedItem,
  options: MemoryLineOptions,
): readonly string[] {
  return [
    `- ${label} [${item.shortID}]:`,
    ...renderMemoryItem(item, options).map((line) => `  ${line}`),
  ];
}
