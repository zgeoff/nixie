import type { ContentSource } from '@heynixie/log';
import type { MemoryOrigin, MemoryStore, VersionRef } from '../types';

export interface MemoryItemRequest {
  readonly text: string;

  readonly origin?: MemoryOrigin;
  readonly source?: ContentSource;

  readonly quote?: string;
}

export function createMemoryItem(
  store: Pick<MemoryStore, 'remember'>,
  request: MemoryItemRequest,
): Promise<VersionRef> {
  const origin = request.origin ?? 'owner';

  return store.remember({
    text: request.text,
    ...(request.quote === undefined ? {} : { evidenceQuote: request.quote }),
    provenance: {
      origin,
      source: request.source ?? 'owner',
      taskID: origin === 'owner' ? null : 'task-1',
      proposalID: null,
      checks: null,
    },
  });
}
