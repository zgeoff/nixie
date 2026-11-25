import { callHeardCutCodec } from '@heynixie/calls';
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

  // how many characters of a reply the user heard before they talked over it
  readonly heardChars?: number;
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

const historyKinds = [
  'owner_message',
  'task_message',
  'model.reply',
  'call.spoke',
  'call.heard_cut',
  'log_reset',
] as const;

async function* readTurnsNewestFirst(
  context: Pick<TasksContext, 'log'>,
  query: RecentTurnsQuery,
): AsyncGenerator<HistoryTurn> {
  const unanswered: HistoryTurn[] = [];

  // A cut sits after the reply it marks, so the newest-first read meets it first.
  const cuts = new Map<string, number>();

  const records = mergeNewestFirst(
    readThreadNewestFirst(context, query.taskID, historyKinds),
    readSentTaskMessages(context, query.taskID),
  );

  for await (const record of records) {
    if (record.sequence <= (query.afterSequence ?? 0) || record.kind === 'log_reset') {
      break;
    }

    if (record.kind === 'call.heard_cut') {
      const cut = callHeardCutCodec.decode(record.payload);

      cuts.set(cut.replyRecordID, cut.heardChars);
    } else if (record.kind === 'call.spoke') {
      // a line at or after the turn's first record shows in the turn's own messages
      if (record.sequence < query.beforeSequence) {
        unanswered.push({ record, answered: null });
      }
    } else if (record.kind === 'model.reply') {
      // an attempt that kept no reply leaves none in the history a rebuilt session reads
      const voided = await readVoidedReplies(context.log.writer.db, [record.sequence]);

      if (!voided.has(record.sequence)) {
        const heardChars = cuts.get(String(record.sequence));

        unanswered.push({
          record,
          answered: null,
          ...(heardChars === undefined ? {} : { heardChars }),
        });
      }
    } else if (record.thread !== query.taskID) {
      unanswered.push({ record, answered: null, isSent: true });
    } else if (record.sequence < query.beforeSequence) {
      yield* unanswered
        .splice(0)
        .map((later) => (later.isSent === true ? later : toAnswered(later, record)));

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

function toAnswered(turn: HistoryTurn, answered: LogRecord): HistoryTurn {
  return turn.heardChars === undefined
    ? { record: turn.record, answered }
    : { record: turn.record, answered, heardChars: turn.heardChars };
}
