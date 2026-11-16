import type { ContentSource } from '@heynixie/log';
import type {
  Labels,
  MemoryOrigin,
  MemoryStore,
  MemorySubject,
  QuoteEvidence,
  VersionRef,
} from '../types';

export interface MemoryItemRequest {
  readonly text: string;

  readonly origin?: MemoryOrigin;
  readonly source?: ContentSource;

  readonly quote?: string;

  // where the quote sits in a record that has its key, or the item stores no quote
  readonly evidence?: QuoteEvidence;

  readonly labels?: Labels;
  readonly isPinned?: boolean;
  readonly subject?: MemorySubject;
}

export function createMemoryItem(
  store: Pick<MemoryStore, 'remember'>,
  request: MemoryItemRequest,
): Promise<VersionRef> {
  const origin = request.origin ?? 'owner';

  return store.remember({
    text: request.text,
    ...(request.quote === undefined ? {} : { evidenceQuote: request.quote }),
    ...(request.evidence === undefined ? {} : { evidence: request.evidence }),
    ...(request.labels === undefined ? {} : { labels: request.labels }),
    ...(request.isPinned === undefined ? {} : { isPinned: request.isPinned }),
    ...(request.subject === undefined ? {} : { subject: request.subject }),
    provenance: {
      origin,
      source: request.source ?? 'owner',
      taskID: origin === 'owner' ? null : 'task-1',
      proposalID: null,
      checks: null,
    },
  });
}
