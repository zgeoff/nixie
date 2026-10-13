import type { LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { countTextTokens } from './count-text-tokens';
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

// Reads the thread's most recent messages and replies, word for word, oldest first, up to the
// token budget. A message from the turn's first inbox record on stays out. Older turns stay out, and reach a rebuilt session only through recall.
export async function readRecentTurns(
  context: Pick<TasksContext, 'log'>,
  query: RecentTurnsQuery,
): Promise<readonly LogRecord[]> {
  const kept: LogRecord[] = [];
  const total = { tokens: 0 };

  for await (const record of readHistoryNewestFirst(context, query.taskID)) {
    const isPending = record.kind === 'owner_message' && record.sequence >= query.beforeSequence;

    total.tokens += isPending ? 0 : countTextTokens(renderHistoryLine(record, query.times));
    if (total.tokens > query.tokens) {
      break;
    }
    if (!isPending) {
      kept.push(record);
    }
  }
  return kept.toReversed();
}

// the records a rebuilt session's history holds: your messages and nixie's replies
const historyKinds = ['owner_message', 'model.reply'] as const;

const pageSize = 200;

async function* readHistoryNewestFirst(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
): AsyncGenerator<LogRecord> {
  const page = { before: Number.MAX_SAFE_INTEGER, size: pageSize };

  while (page.size === pageSize) {
    // oxlint-disable-next-line no-await-in-loop -- each page reads on from the one before it
    const entries = await readRecords(context.log, {
      afterSequence: 0,
      beforeSequence: page.before,
      thread: taskID,
      kinds: historyKinds,
      order: 'newest',
      limit: pageSize,
    });

    yield* entries.map((entry) => entry.record);
    page.size = entries.length;
    page.before = entries.at(-1)?.record.sequence ?? 0;
  }
}
