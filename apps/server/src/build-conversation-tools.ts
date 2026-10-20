import type { Clock } from '@heynixie/clock';
import type { MemoryToolStore } from '@heynixie/memory';
import { buildMemoryTools } from '@heynixie/memory';
import type { ToolDefinition } from '@heynixie/tools';

// What the memory tools reach: the store through readStore, which returns null until it starts,
// the clock memory.pending ages a proposal on, the owner's name and the zone each recalled line
// reads, and the agent's first name, which the owner sees beside each rating.
export interface ConversationMemory {
  readonly readStore: () => MemoryToolStore | null;
  readonly clock: Pick<Clock, 'now'>;
  readonly ownerName: string | null;
  readonly agentName: string | null;
  readonly defaultZone: string;
}

// The conversation's tools that reach no memory store: web fetch, the time tool, the log reader
// and the skill tools.
export interface ConversationReaders {
  readonly webFetch: ToolDefinition;
  readonly time: ToolDefinition;
  readonly logRead: ToolDefinition;
  readonly skills: readonly ToolDefinition[];
}

// Builds the conversation's tool definitions: the web fetch tool, the time tool, the log reader,
// the skill tools and the 11 memory tools. The registry exists before the memory store starts, so the memory tools
// reach the store through readStore. A call before the store starts throws.
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
    ...readers.skills,
    ...buildMemoryTools(
      {
        recall: (request) => requireStore().recall(request),
        rate: (request) => requireStore().rate(request),
        proposals: { listPending: () => requireStore().proposals.listPending() },
        readItemIDMap: (ids) => requireStore().readItemIDMap(ids),
        readShortIDs: (itemIDs) => requireStore().readShortIDs(itemIDs),
        consolidations: {
          readDelivered: () => requireStore().consolidations.readDelivered(),
          comment: (request) => requireStore().consolidations.comment(request),
        },
        writes: {
          remember: (request) => requireStore().writes.remember(request),
          retire: (request) => requireStore().writes.retire(request),
          offerImage: (request) => requireStore().writes.offerImage(request),
          answerOffer: (request) => requireStore().writes.answerOffer(request),
        },
        renderReviewReason: (reason) => requireStore().renderReviewReason(reason),
      },
      {
        clock: memory.clock,
        ownerName: memory.ownerName,
        agentName: memory.agentName,
        defaultZone: memory.defaultZone,
      },
    ),
  ];
}
