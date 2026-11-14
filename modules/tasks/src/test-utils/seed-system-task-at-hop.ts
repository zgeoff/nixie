import { withWriteTransaction } from '@heynixie/log';
import { createSystemTask } from '../create-system-task';
import type { TasksContext, TasksTables } from '../types';

export interface SystemTaskAtHopSeed {
  readonly taskID: string;
  readonly hop: number;
}

export async function seedSystemTaskAtHop(
  context: TasksContext,
  input: SystemTaskAtHopSeed,
): Promise<void> {
  await createSystemTask(context, input.taskID);

  // A system task whose step hop is set with no step started: only a started step sets a hop, and
  // a system task starts none until a message wakes it.
  await withWriteTransaction(context.log.writer, (tx) =>
    tx
      .$extendTables<TasksTables>()
      .updateTable('tasks')
      .set({ step_hop: input.hop })
      .where('task_id', '=', input.taskID)
      .execute(),
  );
}
