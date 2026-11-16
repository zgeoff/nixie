import { withWriteTransaction } from '@heynixie/log';
import { withdrawDefinitionTaskInTransaction } from '../definition/withdraw-definition-task-in-transaction';
import { writeDefinitionTasksInTransaction } from '../definition/write-definition-tasks-in-transaction';
import type { DefinitionRunPolicy, DefinitionVersion, TasksTables } from '../types';
import type { TestTasks } from './start-test-tasks';

export interface DefinitionTaskSeed {
  readonly definitionID: string;

  // the hash in force, or null for a task that its definition left
  readonly definitionHash: string | null;
  readonly version?: Partial<DefinitionVersion>;
  readonly policy?: Partial<DefinitionRunPolicy>;
}

// Binds a task to the definition through the seed's hook, keeping the other definitions in force, and stores the version and the policy
// that the hash names. Returns the task's ID.
export async function seedDefinitionTask(
  tasks: TestTasks,
  seed: DefinitionTaskSeed,
): Promise<string> {
  const hash = seed.definitionHash ?? `${seed.definitionID}-spent`;

  tasks.definitionStore.add(hash, {
    version: { definitionID: seed.definitionID, ...seed.version },
    ...(seed.policy === undefined ? {} : { policy: seed.policy }),
  });

  await withWriteTransaction(tasks.writer, async (tx) => {
    const bound = await tx
      .$extendTables<TasksTables>()
      .selectFrom('tasks')
      .select(['definition_id', 'definition_hash'])
      .where('definition_id', 'is not', null)
      .where('definition_id', '!=', seed.definitionID)
      .where('definition_hash', 'is not', null)
      .execute();

    await writeDefinitionTasksInTransaction(tx, tasks.context, [
      ...bound.flatMap((row) =>
        row.definition_id === null || row.definition_hash === null
          ? []
          : [{ definitionID: row.definition_id, definitionHash: row.definition_hash }],
      ),
      { definitionID: seed.definitionID, definitionHash: hash },
    ]);

    if (seed.definitionHash === null) {
      await withdrawDefinitionTaskInTransaction(tx, tasks.context, seed.definitionID);
    }
  });

  const row = await tasks.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select('task_id')
    .where('definition_id', '=', seed.definitionID)
    .executeTakeFirstOrThrow();

  return row.task_id;
}
