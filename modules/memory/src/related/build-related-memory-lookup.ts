import type { RelatedMemoryLookup } from '@heynixie/tools';
import type { ConversationMemoryStore } from '../tool/memory-tool-store';

const relatedLookupTimeoutMs = 3000;

// The lookup that the tools of other modules take. The store starts after the tools are built, so
// the lookup reads it at each call, and a call that runs before it starts fails, which the tool
// logs and answers without `related`.
export function buildRelatedMemoryLookup(
  readStore: () => Pick<ConversationMemoryStore, 'readRelated'> | null,
  log: RelatedMemoryLookup['log'],
): RelatedMemoryLookup {
  return {
    read: (text) => {
      const store = readStore();

      if (store === null) {
        return Promise.reject(new Error('a lookup ran before the memory store started'));
      }

      return store.readRelated(text);
    },
    timeoutMs: relatedLookupTimeoutMs,
    log,
  };
}
