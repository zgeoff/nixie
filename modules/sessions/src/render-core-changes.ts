import { renderMemoryItem } from './render-memory-item';
import type { MemoryItem, MemoryLineOptions, MemoryRef, PinnedCoreUse } from './types';

export interface CoreChangeOptions extends MemoryLineOptions {
  readonly unpinnedShortIDs: ReadonlyMap<string, string>;
  readonly use: PinnedCoreUse;
}

type PinnedItem = Omit<MemoryItem, 'subject' | 'model'>;

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
    renderCoreUse(options.use),
  ].join('\n');
}

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

function renderCoreUse(use: PinnedCoreUse): string {
  const items = `${String(use.items)} ${use.items === 1 ? 'item' : 'items'}`;

  return `Pinned memory now: ${items}, ${String(use.tokens)} of ${String(use.budget)} tokens.`;
}
