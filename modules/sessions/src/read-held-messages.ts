import { findSessionSummary } from '@heynixie/compaction';
import type { LogTables } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { modelSessionOpenedCodec } from '@heynixie/models';
import type { TasksContext } from '@heynixie/tasks';
import { readRecentTurns } from './read-recent-turns';
import type { MessageTimeOptions } from './types';

export interface HeldMessagesQuery {
  readonly taskID: string;

  // whether the turn opens a new session, whose recent turns the opening has yet to read
  readonly isNewSession: boolean;

  // the turn's first inbox record, which a new session's recent turns never reach
  readonly beforeSequence: number;

  // the budget, in tokens, of a new session's recent turns
  readonly rebuildTokens: number;
  readonly times: MessageTimeOptions;
}

// Reads the sequences of your messages in the thread that the session holds word for word: each one
// from the oldest recent turn its opening holds on. A new session reads its recent turns as its
// opening will, and an opening that kept no mark holds every message of the thread.
export async function readHeldMessages(
  context: Pick<TasksContext, 'log'>,
  query: HeldMessagesQuery,
): Promise<readonly number[]> {
  const heldFrom = query.isNewSession
    ? await readRecentStart(context, query)
    : await readOpenedFrom(context, query.taskID);

  const rows = await context.log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('sequence')
    .where('kind', '=', 'owner_message')
    .where('thread', '=', query.taskID)
    .where('sequence', '>=', heldFrom)
    .execute();

  return rows.map((row) => row.sequence);
}

// the oldest record a new session's recent turns hold, after its summary and before the turn
async function readRecentStart(
  context: Pick<TasksContext, 'log'>,
  query: HeldMessagesQuery,
): Promise<number> {
  const summary = await findSessionSummary(context, query.taskID);

  const recent = await readRecentTurns(context, {
    taskID: query.taskID,
    beforeSequence: query.beforeSequence,
    afterSequence: summary?.throughSequence ?? 0,
    tokens: query.rebuildTokens,
    times: query.times,
  });

  return recent.at(0)?.record.sequence ?? query.beforeSequence;
}

// the mark the newest opening kept, or 0 for one without it
async function readOpenedFrom(context: Pick<TasksContext, 'log'>, taskID: string): Promise<number> {
  const [opened] = await readRecords(context.log, {
    afterSequence: 0,
    thread: taskID,
    kinds: ['model.session_opened', 'model.session_rebuilt'],
    order: 'newest',
    limit: 1,
  });

  // a rebuild record comes from before openings kept the mark
  const payload =
    opened?.record.kind === 'model.session_opened'
      ? modelSessionOpenedCodec.tryDecodePartial(opened.record.payload)
      : null;

  return payload?.heldFrom ?? 0;
}
