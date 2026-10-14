import type { MemoryToolStore } from '@heynixie/memory';
import { buildMemoryTools } from '@heynixie/memory';
import type { Clock } from '@heynixie/tasks';
import type { ToolDefinition } from '@heynixie/tools';

// What the memory tools reach: the store through readStore, which returns null until it starts,
// and the clock that memory.pending measures a proposal's age on.
export interface ConversationMemory {
  readonly readStore: () => MemoryToolStore | null;
  readonly clock: Pick<Clock, 'now'>;
}

// Builds the conversation's tool definitions: the web fetch tool, the time tool and the 5 memory
// tools. The registry exists before the memory store starts, so the memory tools reach the store
// through readStore. A call before the store starts throws.
export function buildConversationTools(
  webFetch: ToolDefinition,
  time: ToolDefinition,
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
    webFetch,
    time,
    ...buildMemoryTools(
      {
        recall: (request) => requireStore().recall(request),
        proposals: { listPending: () => requireStore().proposals.listPending() },
        findItemIDs: (ids) => requireStore().findItemIDs(ids),
        readShortIDs: (itemIDs) => requireStore().readShortIDs(itemIDs),
        writes: {
          remember: (request) => requireStore().writes.remember(request),
          retire: (request) => requireStore().writes.retire(request),
        },
        renderReviewReason: (reason) => requireStore().renderReviewReason(reason),
      },
      memory.clock,
    ),
  ];
}
