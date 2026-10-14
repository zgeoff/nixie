import type { LogRecord } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { countTextTokens } from './count-text-tokens';
import { readThreadNewestFirst } from './read-thread-newest-first';
import { renderHistoryLine } from './render-history-line';
import type { MessageTimeOptions } from './types';

export interface RecentTurnsQuery {
  readonly taskID: string;

  // the turn's first inbox record; the history holds only messages before it, so a pending message
  // reaches the model once, as a live message, and keeps every reply, which a pending message can
  // come before
  readonly beforeSequence: number;

  // the history's budget, counted over its rendered lines
  readonly tokens: number;

  // how each line renders your message's send time, which the budget counts
  readonly times: MessageTimeOptions;
}

// One record of a rebuilt session's history, with the message a reply answers: the newest of your
// messages before it that is not pending, or null for a reply with none, and for your messages.
export interface HistoryTurn {
  readonly record: LogRecord;
  readonly answered: LogRecord | null;
}

// Reads the thread's most recent messages and replies, word for word, oldest first, up to the
// token budget, each reply with the message it answers. A message from the turn's first inbox
// record on stays out. Older turns stay out, and reach a rebuilt session only through recall.
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

// the records a rebuilt session's history holds: your messages and nixie's replies
const historyKinds = ['owner_message', 'model.reply'] as const;

// The history's records, newest first, each reply with the newest message before it. A reply waits
// for the next message read, and a pending message answers none, because a reply after it belongs
// to an earlier turn.
async function* readTurnsNewestFirst(
  context: Pick<TasksContext, 'log'>,
  query: RecentTurnsQuery,
): AsyncGenerator<HistoryTurn> {
  const unanswered: LogRecord[] = [];

  for await (const record of readThreadNewestFirst(context, query.taskID, historyKinds)) {
    if (record.kind === 'model.reply') {
      unanswered.push(record);
    } else if (record.sequence < query.beforeSequence) {
      yield* unanswered.splice(0).map((reply) => ({ record: reply, answered: record }));
      yield { record, answered: null };
    }
  }
  yield* unanswered.map((reply) => ({ record: reply, answered: null }));
}
