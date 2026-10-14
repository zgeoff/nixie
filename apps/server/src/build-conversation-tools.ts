import type { MemoryToolStore } from '@heynixie/memory';
import { buildMemoryTools } from '@heynixie/memory';
import type { Clock } from '@heynixie/tasks';
import type { ToolDefinition } from '@heynixie/tools';

// What the memory tools reach: the store through readStore, which returns null until it starts,
// the clock that memory.pending measures a proposal's age on, and the owner's name and the zone
// that each line memory.recall shows under an item reads.
export interface ConversationMemory {
  readonly readStore: () => MemoryToolStore | null;
  readonly clock: Pick<Clock, 'now'>;
  readonly ownerName: string | null;
  readonly defaultZone: string;
}

// The conversation's tools that reach no memory store: web fetch, the time tool and the log reader.
export interface ConversationReaders {
  readonly webFetch: ToolDefinition;
  readonly time: ToolDefinition;
  readonly logRead: ToolDefinition;
}

// Builds the conversation's tool definitions: the web fetch tool, the time tool, the log reader
// and the 7 memory tools. The registry exists before the memory store starts, so the memory tools reach the store
// through readStore. A call before the store starts throws.
export function buildConversationTools(
  readers: ConversationReaders,
  memory: ConversationMemory,
): readonly ToolDefinition[] {
  const requireStore = (): MemoryToolStore => {
    const store = memory.readStore();

    if (store === null) {
      throw new Error('a tool call ran before the memory store started');
    }
    return store;
  };

  return [
    readers.webFetch,
    readers.time,
    readers.logRead,
    ...buildMemoryTools(
      {
        recall: (request) => requireStore().recall(request),
        proposals: { listPending: () => requireStore().proposals.listPending() },
        findItemIDs: (ids) => requireStore().findItemIDs(ids),
        readShortIDs: (itemIDs) => requireStore().readShortIDs(itemIDs),
        consolidations: {
          readDelivered: () => requireStore().consolidations.readDelivered(),
          comment: (request) => requireStore().consolidations.comment(request),
        },
        writes: {
          remember: (request) => requireStore().writes.remember(request),
          retire: (request) => requireStore().writes.retire(request),
        },
        renderReviewReason: (reason) => requireStore().renderReviewReason(reason),
      },
      { clock: memory.clock, ownerName: memory.ownerName, defaultZone: memory.defaultZone },
    ),
  ];
}
