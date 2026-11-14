import { parseJSONObject } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { taskLimitsRaisedCodec } from '../limit/task-limits-raised-codec';
import type { TasksContext, TasksTables } from '../types';
import { collectPieceRuns } from './collect-piece-runs';
import { toTransactionContext } from './to-transaction-context';
import type { RunMeterName, TaskRun } from './types';

export interface PieceCounts {
  readonly first: TaskRun;

  // the totals of the newest raise since the piece began, or null when it has none
  readonly raised: { readonly turns: number; readonly dollars: number } | null;

  // the use since the piece's newest restart
  readonly used: Readonly<Record<RunMeterName, number>>;
}

// The caller holds the write transaction, so the counts include what the transaction wrote.
export async function readPieceCounts(
  tx: Transaction<unknown>,
  context: Pick<TasksContext, 'log' | 'runSettings'>,
  runs: readonly TaskRun[],
  last: TaskRun,
): Promise<PieceCounts> {
  const piece = collectPieceRuns(runs, last);
  const first = piece.chain[0] ?? last;
  const inTransaction = toTransactionContext(context, tx);

  const raise = await tx
    .$extendTables<TasksTables>()
    .selectFrom('records')
    .select('payload')
    .where('thread', '=', last.taskID)
    .where('kind', '=', 'task.limits_raised')
    .where('sequence', '>', first.openedSequence)
    .orderBy('sequence', 'desc')
    .limit(1)
    .executeTakeFirst();

  const used = { turns: 0, dollars: 0 };

  for (const run of piece.sinceRestart) {
    for (const meter of context.runSettings.meters) {
      used[meter.name] += await meter.read(inTransaction, run);
    }
  }

  return {
    first,
    raised:
      raise === undefined
        ? null
        : taskLimitsRaisedCodec.decode(parseJSONObject(raise.payload)).limits,
    used,
  };
}
