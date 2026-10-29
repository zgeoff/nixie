import { countTextTokens } from '@heynixie/compaction';
import type { LogRecord } from '@heynixie/log';
import { readRecords, readThreadNewestFirst } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { taskMessageMovedCodec } from '@heynixie/tasks';
import { renderHistoryLine } from './render-history-line';
import type { MessageTimeOptions } from './types';

export interface RecentTurnsQuery {
  readonly taskID: string;

  readonly beforeSequence: number;

  readonly afterSequence?: number;

  readonly tokens: number;

  readonly times: MessageTimeOptions;
}

export interface HistoryTurn {
  readonly record: LogRecord;
  readonly answered: LogRecord | null;
}

export async function readRecentTurns(
  context: Pick<TasksContext, 'log'>,
  query: RecentTurnsQuery,
): Promise<readonly HistoryTurn[]> {
  const kept: HistoryTurn[] = [];
  const total = { tokens: 0 };

  for await (const turn of readTurnsNewestFirst(context, query)) {
    total.tokens += countTextTokens(renderHistoryLine(turn, query.times));

    if (total.tokens > query.tokens) {
      break;
    }

    kept.push(turn);
  }

  return kept.toReversed();
}

const historyKinds = [
  'owner_message',
  'task_message',
  'task.message_moved',
  'model.reply',
  'log_reset',
] as const;

async function* readTurnsNewestFirst(
  context: Pick<TasksContext, 'log'>,
  query: RecentTurnsQuery,
): AsyncGenerator<HistoryTurn> {
  const unanswered: LogRecord[] = [];

  for await (const record of readThreadNewestFirst(context, query.taskID, historyKinds)) {
    if (record.sequence <= (query.afterSequence ?? 0) || record.kind === 'log_reset') {
      break;
    }

    if (record.kind === 'model.reply') {
      unanswered.push(record);
    } else if (record.sequence < query.beforeSequence) {
      const turn = await readTurnRecord(context, query.taskID, record);

      if (turn !== null) {
        yield* unanswered.splice(0).map((reply) => ({ record: reply, answered: turn }));
        yield { record: turn, answered: null };
      }
    }
  }

  yield* unanswered.map((reply) => ({ record: reply, answered: null }));
}

// A message the user moved to this thread joins its history as the message itself, as if it had
// come here first. A notice that a message moved away holds nothing the history needs.
async function readTurnRecord(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
  record: LogRecord,
): Promise<LogRecord | null> {
  if (record.kind !== 'task.message_moved') {
    return record;
  }

  const move = taskMessageMovedCodec.decode(record.payload);

  if (move.to !== taskID) {
    return null;
  }

  const [entry] = await readRecords(context.log, {
    afterSequence: 0,
    sequences: [move.message],
    limit: 1,
  });

  return entry?.record.kind === 'owner_message' ? entry.record : null;
}
