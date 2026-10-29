import type { Clock } from '@heynixie/clock';
import type { MemoryToolStore } from '@heynixie/memory';
import { buildMemoryTools } from '@heynixie/memory';
import type { ToolDefinition } from '@heynixie/tools';

export interface ConversationMemory {
  readonly readStore: () => MemoryToolStore | null;
  readonly clock: Pick<Clock, 'now'>;
  readonly ownerName: string | null;
  readonly agentName: string | null;
  readonly defaultZone: string;
}

export interface ConversationReaders {
  readonly webFetch: ToolDefinition;
  readonly time: ToolDefinition;
  readonly logReaders: readonly ToolDefinition[];
  readonly skills: readonly ToolDefinition[];
  readonly prompts: readonly ToolDefinition[];
  readonly tasks: readonly ToolDefinition[];
}

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
    ...readers.logReaders,
    ...readers.skills,
    ...readers.prompts,
    ...readers.tasks,
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
          pin: (request) => requireStore().writes.pin(request),
          unpin: (request) => requireStore().writes.unpin(request),
          markSensitive: (request) => requireStore().writes.markSensitive(request),
        },
        renderReviewReason: (reason) => requireStore().renderReviewReason(reason),
        moments: {
          keep: (request) => requireStore().moments.keep(request),
          edit: (request) => requireStore().moments.edit(request),
          link: (request) => requireStore().moments.link(request),
          retire: (request) => requireStore().moments.retire(request),
          read: (request) => requireStore().moments.read(request),
          readMatches: (query) => requireStore().moments.readMatches(query),
          readWeekCount: (at) => requireStore().moments.readWeekCount(at),
          readLinks: (itemIDs) => requireStore().moments.readLinks(itemIDs),
        },
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
