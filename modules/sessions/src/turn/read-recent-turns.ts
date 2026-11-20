import { countTextTokens } from '@heynixie/compaction';
import type { LogRecord } from '@heynixie/log';
import { readThreadNewestFirst } from '@heynixie/log';
import { readVoidedReplies } from '@heynixie/models';
import type { TaskMessaging, TasksContext } from '@heynixie/tasks';
import { readSentTaskMessages } from '@heynixie/tasks';
import type { MessageTimeOptions } from '../types';
import { renderHistoryLine } from './render-history-line';

export interface RecentTurnsQuery {
  readonly taskID: string;

  readonly beforeSequence: number;

  readonly afterSequence?: number;

  readonly tokens: number;

  readonly times: MessageTimeOptions;
  readonly messaging: TaskMessaging;
}

export interface HistoryTurn {
  readonly record: LogRecord;
  readonly answered: LogRecord | null;

  readonly isSent?: boolean;
}

export async function readRecentTurns(
  context: Pick<TasksContext, 'log'>,
  query: RecentTurnsQuery,
): Promise<readonly HistoryTurn[]> {
  const kept: HistoryTurn[] = [];
  const total = { tokens: 0 };

  for await (const turn of readTurnsNewestFirst(context, query)) {
    total.tokens += countTextTokens(renderHistoryLine(turn, query.times, query));

    if (total.tokens > query.tokens) {
      break;
    }

    kept.push(turn);
  }

  return kept.toReversed();
}

const historyKinds = ['owner_message', 'task_message', 'model.reply', 'log_reset'] as const;

async function* readTurnsNewestFirst(
  context: Pick<TasksContext, 'log'>,
  query: RecentTurnsQuery,
): AsyncGenerator<HistoryTurn> {
  const unanswered: HistoryTurn[] = [];

  const records = mergeNewestFirst(
    readThreadNewestFirst(context, query.taskID, historyKinds),
    readSentTaskMessages(context, query.taskID),
  );

  for await (const record of records) {
    if (record.sequence <= (query.afterSequence ?? 0) || record.kind === 'log_reset') {
      break;
    }

    if (record.kind === 'model.reply') {
      // an attempt that kept no reply leaves none in the history a rebuilt session reads
      const voided = await readVoidedReplies(context.log.writer.db, [record.sequence]);

      if (!voided.has(record.sequence)) {
        unanswered.push({ record, answered: null });
      }
    } else if (record.thread !== query.taskID) {
      unanswered.push({ record, answered: null, isSent: true });
    } else if (record.sequence < query.beforeSequence) {
      yield* unanswered
        .splice(0)
        .map((later) =>
          later.isSent === true ? later : { record: later.record, answered: record },
        );

      yield { record, answered: null };
    }
  }

  yield* unanswered;
}

async function* mergeNewestFirst(
  first: AsyncGenerator<LogRecord>,
  second: AsyncGenerator<LogRecord>,
): AsyncGenerator<LogRecord> {
  let left = await first.next();
  let right = await second.next();

  while (left.done !== true || right.done !== true) {
    if (right.done === true || (left.done !== true && left.value.sequence > right.value.sequence)) {
      yield left.value;

      left = await first.next();
    } else {
      yield right.value;

      right = await second.next();
    }
  }
}
