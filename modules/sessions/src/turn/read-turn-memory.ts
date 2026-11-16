import type { LogRecord } from '@heynixie/log';
import { readHeldMessages } from '../held/read-held-messages';
import { readSessionDeliveries } from '../session/read-session-deliveries';
import type { ConversationRun, MemoryItem, MemoryLineOptions, PastMessage } from '../types';
import type { TurnContextQuery } from './read-turn-context';

export interface TurnRetrieval {
  readonly items: readonly MemoryItem[];
  readonly selfNotes: readonly MemoryItem[];
  readonly messages: readonly PastMessage[];
}

type MemoryRun = Pick<
  ConversationRun,
  'context' | 'memorySettings' | 'frame' | 'messaging' | 'sinceSequence'
> &
  Required<Pick<ConversationRun, 'memory'>>;

// Asks the memory module once what the turn brings. The module decides which pushes run, so this
// reads nothing from the log until the module asks for what the session holds.
export async function readTurnMemory(
  run: MemoryRun,
  query: TurnContextQuery,
  times: MemoryLineOptions,
): Promise<TurnRetrieval> {
  const settings = run.memorySettings;
  const deliveries = lazy(() => readSessionDeliveries(run.context, query.taskID));

  const result = await run.memory().readTurnMemory({
    text: collectQueryText(run, query),
    thread: query.taskID,
    excludedWords: [
      ...settings.agentNames,
      ...(settings.ownerName === null ? [] : [settings.ownerName]),
    ],
    held: {
      readVersions: async () => {
        if (query.isNewSession) {
          return [];
        }

        const delivered = await deliveries();

        return delivered.versions;
      },
      readMessages: async () => {
        const held = await readHeldMessages(run.context, {
          taskID: query.taskID,
          isNewSession: query.isNewSession,
          ...(run.sinceSequence === undefined ? {} : { afterSequence: run.sinceSequence }),
          beforeSequence: Math.min(
            Number.MAX_SAFE_INTEGER,
            ...query.batch.map((record) => record.sequence),
          ),
          rebuildTokens: settings.rebuildTokens,
          times,
          messaging: run.messaging,
        });

        const delivered = query.isNewSession ? null : await deliveries();

        return [...new Set([...held, ...(delivered?.messages ?? [])])];
      },
    },
  });

  if (result.kind === 'none') {
    return { items: [], selfNotes: [], messages: [] };
  }

  return { items: result.items, selfNotes: result.selfNotes, messages: result.messages };
}

function lazy<T>(read: () => Promise<T>): () => Promise<T> {
  const cache: { promise: Promise<T> | null } = { promise: null };

  return () => {
    cache.promise ??= read();

    return cache.promise;
  };
}

// A started task's work arrives as its brief and as messages from other tasks, where the
// conversation's arrives as the user's messages.
function collectQueryText(run: Pick<ConversationRun, 'frame'>, query: TurnContextQuery): string {
  const isTask = run.frame.kind === 'task';

  // A brief record is in the batch, so its message counts there.
  const brief =
    isTask && query.isFirstSession && query.brief?.origin === 'created' ? query.brief.body : null;

  const messages = query.batch.flatMap((record) => {
    const message = findMessageText(record, isTask);

    return message === null ? [] : [message];
  });

  return [...(brief === null ? [] : [brief]), ...messages].join('\n');
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
