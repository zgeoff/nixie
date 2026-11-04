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

type RetrievalRun = Pick<ConversationRun, 'context' | 'memorySettings' | 'frame' | 'messaging'> &
  Required<Pick<ConversationRun, 'memory'>>;

export async function readTurnRetrieval(
  run: RetrievalRun,
  query: TurnContextQuery,
  times: MemoryLineOptions,
): Promise<TurnRetrieval> {
  const text = collectQueryText(run, query);

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

// A started task's work arrives as its brief and as messages from other tasks, where the
// conversation's arrives as the user's messages.
function collectQueryText(
  run: Pick<ConversationRun, 'frame' | 'messaging'>,
  query: TurnContextQuery,
): string {
  const isTask = run.frame.kind === 'task';
  const brief = isTask && query.isFirstSession ? findTaskBrief(run, query.taskID) : null;

  const messages = query.batch.flatMap((record) => {
    const message = findMessageText(record, isTask);

    return message === null ? [] : [message];
  });

  return [...(brief === null ? [] : [brief]), ...messages].join('\n');
}

function findTaskBrief(run: Pick<ConversationRun, 'messaging'>, taskID: string): string | null {
  return run.messaging.directory.find((entry) => entry.taskID === taskID)?.brief ?? null;
}

function findMessageText(record: LogRecord, isTask: boolean): string | null {
  const field = pickMessageField(record.kind, isTask);

  if (field === null || record.erasable.status !== 'readable') {
    return null;
  }

  const text = record.erasable.fields[field];

  return typeof text === 'string' ? text : null;
}

function pickMessageField(kind: string, isTask: boolean): string | null {
  if (kind === 'owner_message') {
    return 'text';
  }

  return isTask && kind === 'task_message' ? 'body' : null;
}

interface MessageSearch {
  readonly text: string;
  readonly excludedWords: readonly string[];

  readonly delivered: readonly number[];
  readonly times: MemoryLineOptions;
}

async function readRetrievedMessages(
  run: RetrievalRun,
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
