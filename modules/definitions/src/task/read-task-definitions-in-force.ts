import type { DefinitionInForce } from '@heynixie/tasks';
import type { Transaction } from 'kysely';
import { z } from 'zod';
import type { DefinitionsTables, SnapshotTasks } from '../types';

const formSchema = z.looseObject({
  target: z.enum(['task', 'conversation']),
  enabled: z.boolean(),
});

// The definitions in force that own a task: those with target: task that are not disabled. The seed
// hands them to the tasks module, which binds one task to each. A definition with target:
// conversation has no task, and a disabled one is out of force.
export async function readTaskDefinitionsInForce(
  tx: Transaction<unknown>,
  tasks: SnapshotTasks,
): Promise<readonly DefinitionInForce[]> {
  if (tasks.length === 0) {
    return [];
  }

  const rows = await tx
    .$extendTables<DefinitionsTables>()
    .selectFrom('task_definition_versions')
    .select(['definition_hash', 'form'])
    .where(
      'definition_hash',
      'in',
      tasks.map((task) => task.hash),
    )
    .execute();

  const forms = new Map(
    rows.map((row) => [row.definition_hash, formSchema.parse(JSON.parse(row.form))]),
  );

  return tasks.flatMap((task) => {
    const form = forms.get(task.hash);

    return form?.target === 'task' && form.enabled
      ? [{ definitionID: task.id, definitionHash: task.hash }]
      : [];
  });
}
