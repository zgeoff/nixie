import type { Clock } from '@heynixie/clock';
import type { MemoryToolStore } from '@heynixie/memory';
import { buildMemoryTools } from '@heynixie/memory';
import type { ToolDefinition } from '@heynixie/tools';
import { buildProposalsPendingTool } from '../proposal/build-proposals-pending-tool';
import { buildProposalsWithdrawTool } from '../proposal/build-proposals-withdraw-tool';
import type { ProposalsToolDeps } from '../proposal/types';

export interface ConversationMemory {
  readonly readStore: () => MemoryToolStore | null;
  readonly clock: Pick<Clock, 'now'>;
  readonly ownerName: string | null;
  readonly defaultZone: string;

  // the tools that list and withdraw the proposals of every family, memory's among them
  readonly proposals: ProposalsToolDeps;
}

export function buildConversationMemoryTools(
  memory: ConversationMemory,
): readonly ToolDefinition[] {
  const requireStore = (): MemoryToolStore => {
    const store = memory.readStore();

    if (store === null) {
      throw new Error('a tool call ran before the memory store started');
    }

    return store;
  };

  const memoryTools = buildMemoryTools(
    {
      recall: (request) => requireStore().recall(request),
      readTopicLines: (request) => requireStore().readTopicLines(request),
      readTopicCounts: (request) => requireStore().readTopicCounts(request),
      readUsage: (beforeSequence) => requireStore().readUsage(beforeSequence),
      readSavedTimes: (itemIDs) => requireStore().readSavedTimes(itemIDs),
      readUsageList: (request) => requireStore().readUsageList(request),
      proposals: { listPending: () => requireStore().proposals.listPending() },
      readItemIDMap: (ids) => requireStore().readItemIDMap(ids),
      readShortIDs: (itemIDs) => requireStore().readShortIDs(itemIDs),
      writes: {
        remember: (request) => requireStore().writes.remember(request),
        editLabels: (request) => requireStore().writes.editLabels(request),
        retire: (request) => requireStore().writes.retire(request),
        pin: (request) => requireStore().writes.pin(request),
        unpin: (request) => requireStore().writes.unpin(request),
        readRememberSources: (request) => requireStore().writes.readRememberSources(request),
        readRetireSources: (request) => requireStore().writes.readRetireSources(request),
        readItemSubject: (itemID) => requireStore().writes.readItemSubject(itemID),
        readItemLabels: (itemID) => requireStore().writes.readItemLabels(itemID),
        readTopics: (excludedItemID) => requireStore().writes.readTopics(excludedItemID),
        retopic: (request) => requireStore().writes.retopic(request),
        readRetopicPlan: (source, target) => requireStore().writes.readRetopicPlan(source, target),
        readRetopicShown: (callSequence) => requireStore().writes.readRetopicShown(callSequence),
        removeRetopicCardOfForgotten: (callSequence, itemIDs) =>
          requireStore().writes.removeRetopicCardOfForgotten(callSequence, itemIDs),
        writeFoldOrder: (request) => requireStore().writes.writeFoldOrder(request),
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
      defaultZone: memory.defaultZone,
    },
  );

  return [
    ...memoryTools,
    buildProposalsPendingTool(memory.proposals),
    buildProposalsWithdrawTool(memory.proposals),
  ];
}
