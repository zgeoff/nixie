import { triggerSchema } from '@heynixie/contract';
import type { ArmedDefinition } from '@heynixie/triggers';
import type { Transaction } from 'kysely';
import { z } from 'zod';
import type { DefinitionsTables, SnapshotTasks } from '../types';

const formSchema = z.looseObject({
  target: z.enum(['task', 'conversation']),
  enabled: z.boolean(),
  trigger: triggerSchema.nullish(),
});

// The definitions in force that can fire: those that are not disabled and hold a trigger, of either
// target. The seed hands them to the triggers module, which arms them.
export async function readArmedDefinitionsInForce(
  tx: Transaction<unknown>,
  tasks: SnapshotTasks,
): Promise<readonly ArmedDefinition[]> {
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

    return form?.enabled === true && form.trigger !== null && form.trigger !== undefined
      ? [
          {
            definitionID: task.id,
            definitionHash: task.hash,
            source: 'schedule' as const,
            target: form.target,
            trigger: form.trigger,
          },
        ]
      : [];
  });
}
