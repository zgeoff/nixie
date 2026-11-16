import type { ActionConnector } from '@heynixie/connectors';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { waitAtFaultPoint } from '@heynixie/tasks';
import type { ActionsTables } from '../types';
import { buildUnknownRecords } from './build-unknown-records';

// An attempt with a record and no result may have reached the provider, so recovery settles it as an
// unknown outcome, by what the action's connector declares.
export async function writeUnknownOutcomes(
  context: TasksContext,
  connectors: ReadonlyMap<string, ActionConnector> = new Map(),
): Promise<void> {
  const settled = await withWriteTransaction(context.log.writer, async (tx) => {
    const open = await tx
      .$extendTables<ActionsTables>()
      .selectFrom('actions')
      .selectAll()
      .where('attempt_open', '=', 1)
      .orderBy('queued_sequence')
      .execute();

    const now = context.clock.now();

    await writeRecordsInTransaction(
      tx,
      context.log,
      open.flatMap((action) =>
        buildUnknownRecords(context, {
          action,
          attempt: action.attempt_count,
          reason: 'attempt_without_result',
          details: {},
          connector: connectors.get(action.tool),
          now,
        }),
      ),
    );

    return open;
  });

  if (NIXIE_TEST_BUILD) {
    for (const action of settled) {
      await waitAtFaultPoint('inbox.write.after', { kind: 'task', id: action.task_id });
    }
  }
}
