import type { RecordInput } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { DefinitionInForce } from '../definition/write-definition-tasks-in-transaction';
import { writeDefinitionTasksInTransaction } from '../definition/write-definition-tasks-in-transaction';
import { triggerFiredCodec } from '../task/codec/trigger-fired-codec';
import type { TasksContext, TasksTables } from '../types';

// Binds, fires and withdraws each definition's task through the seed's hook, keeping the definitions
// in force before bound, so each task is out of force with a pending task run. One write
// transaction holds it all, so a test can seed many tasks fast.
export function seedWithdrawnPendingTasks(
  context: Pick<TasksContext, 'definitions' | 'log'>,
  seeds: readonly DefinitionInForce[],
): Promise<readonly string[]> {
  const definitionIDs = seeds.map((seed) => seed.definitionID);

  return withWriteTransaction(context.log.writer, async (tx) => {
    const db = tx.$extendTables<TasksTables>();

    const bound = await db
      .selectFrom('tasks')
      .select(['definition_id', 'definition_hash'])
      .where('definition_id', 'is not', null)
      .where('definition_hash', 'is not', null)
      .execute();

    const kept = bound.flatMap((row) =>
      row.definition_id === null ||
      row.definition_hash === null ||
      definitionIDs.includes(row.definition_id)
        ? []
        : [{ definitionID: row.definition_id, definitionHash: row.definition_hash }],
    );

    await writeDefinitionTasksInTransaction(tx, context, [...kept, ...seeds]);

    const rows = await db
      .selectFrom('tasks')
      .select(['task_id', 'definition_id'])
      .where('definition_id', 'in', definitionIDs)
      .execute();

    const taskIDs = new Map(rows.map((row) => [row.definition_id, row.task_id]));

    const fires = seeds.flatMap((seed): RecordInput[] => {
      const taskID = taskIDs.get(seed.definitionID);

      return taskID === undefined
        ? []
        : [
            {
              kind: 'trigger.fired',
              definitions: context.definitions(),
              thread: taskID,
              payload: triggerFiredCodec.encode({
                definitionID: seed.definitionID,
                definitionHash: seed.definitionHash,
                source: 'schedule',
                dedupeKey: `${seed.definitionID}|2027-03-11T21:00:00.000Z`,
                kind: 'schedule',
                scheduledFor: '2027-03-11T21:00:00.000Z',
                firedAt: '2027-03-11T21:00:00.000Z',
                isCatchUp: false,
                skipped: [],
                skippedCount: 0,
              }),
            },
          ];
    });

    await writeRecordsInTransaction(tx, context.log, fires);
    await writeDefinitionTasksInTransaction(tx, context, kept);

    return definitionIDs.flatMap((definitionID) => taskIDs.get(definitionID) ?? []);
  });
}
