import { readSessionSummary } from '@heynixie/compaction';
import type { LogTables } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { modelSessionOpenedCodec } from '@heynixie/models';
import type { TasksContext } from '@heynixie/tasks';
import { readRecentTurns } from './read-recent-turns';
import type { MessageTimeOptions } from './types';

export interface HeldMessagesQuery {
  readonly taskID: string;

  readonly isNewSession: boolean;

  readonly beforeSequence: number;

  readonly rebuildTokens: number;
  readonly times: MessageTimeOptions;
}

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

async function readRecentStart(
  context: Pick<TasksContext, 'log'>,
  query: HeldMessagesQuery,
): Promise<number> {
  const summary = await readSessionSummary(context, query.taskID);

  const recent = await readRecentTurns(context, {
    taskID: query.taskID,
    beforeSequence: query.beforeSequence,
    afterSequence: summary?.throughSequence ?? 0,
    tokens: query.rebuildTokens,
    times: query.times,
  });

  return recent.at(0)?.record.sequence ?? query.beforeSequence;
}

async function readOpenedFrom(context: Pick<TasksContext, 'log'>, taskID: string): Promise<number> {
  const [opened] = await readRecords(context.log, {
    afterSequence: 0,
    thread: taskID,
    kinds: ['model.session_opened', 'model.session_rebuilt'],
    order: 'newest',
    limit: 1,
  });

  const payload =
    opened?.record.kind === 'model.session_opened'
      ? modelSessionOpenedCodec.tryDecodePartial(opened.record.payload)
      : null;

  return payload?.heldFrom ?? 0;
}
