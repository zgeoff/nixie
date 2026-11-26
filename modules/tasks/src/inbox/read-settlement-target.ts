import { isFinishedState } from '@heynixie/task-control';
import type { Transaction } from 'kysely';
import { readRunRows } from '../run/read-run-rows';
import type { TasksTables } from '../types';
import { pickSettlementThread } from './pick-settlement-thread';

export interface SettlementTarget {
  readonly thread: string;

  // the proposing task's ID, when it had closed and the settlement went to another thread
  readonly task: string | null;
}

// A closed task takes no input, so its settlement goes to the report target that the task run which
// proposed it pinned, else to its starter, and names the task by ID: its name is erasable in the
// log. The proposing run is the newest one that opened at or before the proposal's record.
export async function readSettlementTarget(
  tx: Transaction<unknown>,
  thread: string,
  proposedSequence: number,
): Promise<SettlementTarget> {
  const task = await tx
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['state', 'started_by'])
    .where('task_id', '=', thread)
    .executeTakeFirst();

  if (task === undefined || !isFinishedState(task.state)) {
    return { thread, task: null };
  }

  const runs = await readRunRows(tx, thread);

  const target = pickSettlementThread({
    runs: runs.map((run) => ({
      openedSequence: run.openedSequence,
      target: run.opened.report.target,
    })),
    starter: task.started_by,
    proposedSequence,
  });

  return target === null ? { thread, task: null } : { thread: target, task: thread };
}
