import type { ContentSource } from '@heynixie/log';
import type { MemoryOrigin, MemoryStore, VersionRef } from '../types';

export interface MemoryItemRequest {
  readonly text: string;

  // who wrote it and where its text came from, you and your own words by default
  readonly origin?: MemoryOrigin;
  readonly source?: ContentSource;
}

// Writes a memory item's first version straight to the store, as your own action in the client
// does, and returns the item at that version.
export function createMemoryItem(
  store: Pick<MemoryStore, 'remember'>,
  request: MemoryItemRequest,
): Promise<VersionRef> {
  const origin = request.origin ?? 'owner';

  return store.remember({
    text: request.text,
    provenance: {
      origin,
      source: request.source ?? 'owner',
      taskID: origin === 'owner' ? null : 'task-1',
      proposalID: null,
      checks: null,
    },
  });
}
