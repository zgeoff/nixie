import type { LogRecord } from '@heynixie/log';
import { readHeldMessages } from './read-held-messages';
import { readSessionDeliveries } from './read-session-deliveries';
import type { TurnContextQuery } from './read-turn-context';
import type { ConversationRun, MemoryItem, MemoryLineOptions, PastMessage } from './types';

export interface TurnRetrieval {
  readonly items: readonly MemoryItem[];
  readonly selfNotes: readonly MemoryItem[];
  readonly messages: readonly PastMessage[];
}

export async function readTurnRetrieval(
  run: Pick<ConversationRun, 'context' | 'memory' | 'memorySettings'>,
  query: TurnContextQuery,
  times: MemoryLineOptions,
): Promise<TurnRetrieval> {
  const text = query.batch
    .flatMap((record) => {
      const message = findMessageText(record);

      return message === null ? [] : [message];
    })
    .join('\n');

  if (text.trim() === '') {
    return { items: [], selfNotes: [], messages: [] };
  }

  const settings = run.memorySettings;

  const delivered = query.isNewSession
    ? { versions: [], messages: [] }
    : await readSessionDeliveries(run.context, query.taskID);

  const excludedWords = [
    ...settings.agentNames,
    ...(settings.ownerName === null ? [] : [settings.ownerName]),
  ];

  const result = await run.memory().recall({
    query: text,

    limit: settings.retrievalItems,
    selfNoteLimit: settings.retrievalSelfNotes,
    minScore: settings.retrievalMinScore,
    minSimilarity: settings.retrievalMinSimilarity,
    excludePinned: true,
    excludeSensitive: true,
    excludedVersions: delivered.versions,
    excludedWords,
    thread: query.taskID,
  });

  const messages = await readRetrievedMessages(run, query, {
    text,
    excludedWords,
    delivered: delivered.messages,
    times,
  });

  return {
    items: result.items.filter((item) => item.subject !== 'self'),
    selfNotes: result.items.filter((item) => item.subject === 'self'),
    messages,
  };
}

function findMessageText(record: LogRecord): string | null {
  if (record.kind !== 'owner_message' || record.erasable.status !== 'readable') {
    return null;
  }

  const text = record.erasable.fields['text'];

  return typeof text === 'string' ? text : null;
}

interface MessageSearch {
  readonly text: string;
  readonly excludedWords: readonly string[];

  readonly delivered: readonly number[];
  readonly times: MemoryLineOptions;
}

async function readRetrievedMessages(
  run: Pick<ConversationRun, 'context' | 'memory' | 'memorySettings'>,
  query: TurnContextQuery,
  search: MessageSearch,
): Promise<readonly PastMessage[]> {
  const settings = run.memorySettings;

  if (settings.retrievalMessages === 0) {
    return [];
  }

  const held = await readHeldMessages(run.context, {
    taskID: query.taskID,
    isNewSession: query.isNewSession,
    beforeSequence: Math.min(
      Number.MAX_SAFE_INTEGER,
      ...query.batch.map((record) => record.sequence),
    ),
    rebuildTokens: settings.rebuildTokens,
    times: search.times,
  });

  const result = await run.memory().recallMessages({
    query: search.text,
    limit: settings.retrievalMessages,
    minScore: settings.retrievalMinScore,
    minSimilarity: settings.retrievalMinSimilarity,
    excludedSequences: [...new Set([...held, ...search.delivered])],
    excludedWords: search.excludedWords,
  });

  return result.messages;
}
