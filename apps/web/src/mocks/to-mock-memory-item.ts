import type { ContractOutputs } from '@heynixie/contract';
import type { ReadonlyDeep } from '../types';
import { isMockItemShredded } from './is-mock-item-shredded';
import type { store } from './store';

export type StoredMemoryItem = ReadonlyDeep<ReturnType<typeof store.memoryItems.all>[number]>;

type MemoryItem = ContractOutputs['memory']['listItems']['items'][number];

// An item as nixie's API lists it: its current version's text, origin and source, its first and
// latest version's times, and no text once its key is gone.
export function toMockMemoryItem(item: StoredMemoryItem): MemoryItem {
  const [first] = item.versions;
  const current = item.versions.at(-1);

  if (first === undefined || current === undefined) {
    throw new Error(`the mock memory item ${item.itemID} has no version`);
  }

  const isGone = isMockItemShredded(item);

  return {
    changedAt: current.recordedAt,
    createdAt: first.recordedAt,
    forgottenAt: item.forgottenAt,
    isPinned: item.isPinned,
    itemID: item.itemID,
    kind: item.kind,
    origin: current.origin,
    shortID: item.shortID,
    source: current.source,
    state: item.state,
    ...(isGone
      ? { status: 'shredded' as const }
      : { status: 'readable' as const, text: current.text }),
    version: item.versions.length,
  };
}
