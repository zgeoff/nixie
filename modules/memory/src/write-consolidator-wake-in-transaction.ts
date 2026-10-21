import type { TasksTables } from '@heynixie/tasks';
import { writeInboxRecordsInTransaction } from '@heynixie/tasks';
import type { Transaction } from 'kysely';
import type { ConsolidationTables } from './consolidation-types';
import { memoryConsolidatorTaskID } from './memory-consolidator-task-id';
import type { StoreParts } from './types';

export async function writeConsolidatorWakeInTransaction(
  tx: Transaction<unknown>,
  parts: StoreParts,
): Promise<void> {
  const db = tx.$extendTables<ConsolidationTables & TasksTables>();
  const now = parts.context.gate.clock.now();

  const pending = await db
    .selectFrom('memory_consolidation_changes')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .where('status', '=', 'pending')
    .where('lapse_at', '>', now)
    .executeTakeFirst();

  const task = await db
    .selectFrom('tasks')
    .select('state')
    .where('task_id', '=', memoryConsolidatorTaskID)
    .executeTakeFirst();

  if ((pending?.count ?? 0) > 0 || task === undefined || isFinished(task.state)) {
    return;
  }

  await writeInboxRecordsInTransaction(tx, { log: parts.context.log }, [
    {
      kind: 'task.wake',
      definitions: parts.context.definitions(),
      thread: memoryConsolidatorTaskID,
      payload: { at: now },
    },
  ]);
}

function isFinished(state: string): boolean {
  return state === 'done' || state === 'failed';
}
