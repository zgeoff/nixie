import type { LogRecord } from '@heynixie/log';
import { readHeldMessages } from './read-held-messages';
import { readSessionDeliveries } from './read-session-deliveries';
import type { TurnContextQuery } from './read-turn-context';
import type { ConversationRun, MemoryItem, MemoryLineOptions, PastMessage } from './types';

// What one turn's retrieval placed: the facts, the self-notes and your past messages, best first.
export interface TurnRetrieval {
  readonly items: readonly MemoryItem[];
  readonly selfNotes: readonly MemoryItem[];
  readonly messages: readonly PastMessage[];
}

// Searches memory items and your past messages with the readable text of the turn's messages, less
// your name and the agent's, which most items hold. Each search leaves out what the session holds:
// pinned items and delivered versions for items, and held or placed messages for past messages.
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

    // one ranking of every match, which caps the facts and the self-notes each on its own
    limit: settings.retrievalItems,
    selfNoteLimit: settings.retrievalSelfNotes,
    minScore: settings.retrievalMinScore,
    minSimilarity: settings.retrievalMinSimilarity,
    excludePinned: true,
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

// your readable words in a message record; a forgotten one gives retrieval nothing to search
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

  // the past messages earlier turns of the session placed
  readonly delivered: readonly number[];
  readonly times: MemoryLineOptions;
}

// your past messages that match, leaving out each one the session holds word for word and each one
// an earlier turn of the session placed
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
