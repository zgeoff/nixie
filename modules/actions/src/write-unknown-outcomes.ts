import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { waitAtFaultPoint } from '@heynixie/tasks';
import type { ActionsTables } from './types';

// Recovery step 3: marks each action that started an attempt without a recorded result as unknown,
// with a record that reaches its task's inbox. The call may have reached the provider, so the
// action never runs a plain second attempt; in slice 1 it stays unknown.
export async function writeUnknownOutcomes(context: TasksContext): Promise<void> {
  const settled = await withWriteTransaction(context.log.writer, async (tx) => {
    const open = await tx
      .$extendTables<ActionsTables>()
      .selectFrom('actions')
      .select(['action_id', 'task_id', 'attempt_count'])
      .where('attempt_open', '=', 1)
      .orderBy('queued_sequence')
      .execute();

    await writeRecordsInTransaction(
      tx,
      context.log,
      open.map((action) => ({
        kind: 'action.outcome',
        definitions: context.definitions(),
        thread: action.task_id,
        payload: {
          actionID: action.action_id,
          status: 'unknown',
          attempt: action.attempt_count,
          reason: 'attempt_without_result',
        },
      })),
    );
    return open;
  });

  if (NIXIE_TEST_BUILD) {
    for (const action of settled) {
      // oxlint-disable-next-line no-await-in-loop -- the harness holds each arrival in turn
      await waitAtFaultPoint('inbox.write.after', { kind: 'task', id: action.task_id });
    }
  }
}
