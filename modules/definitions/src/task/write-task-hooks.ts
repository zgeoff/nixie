import type { Definitions, Log } from '@heynixie/log';
import { writeDefinitionTasksInTransaction } from '@heynixie/tasks';
import type { ArmedDefinition } from '@heynixie/triggers';
import { readSpentOneShots, writeArmedDefinitions } from '@heynixie/triggers';
import type { Transaction } from 'kysely';
import type { SnapshotTasks } from '../types';
import { readArmedDefinitionsInForce } from './read-armed-definitions-in-force';
import { readTaskDefinitionsInForce } from './read-task-definitions-in-force';

export interface TaskHooksContext {
  readonly log: Log;
  readonly definitions: () => Definitions;

  // the triggers that others own, such as a reminder's, which the arming hook must not withdraw
  readonly readExtraArmed?: (tx: Transaction<unknown>) => Promise<readonly ArmedDefinition[]>;
}

// The seed's 2 hooks, which run at every accepted seed in its transaction: the tasks module binds
// one task to each definition, then the triggers module arms each definition that
// holds a trigger. A spent one-shot is left out of both lists, and the triggers that others own join the second.
export async function writeTaskHooks(
  tx: Transaction<unknown>,
  context: TaskHooksContext,
  tasks: SnapshotTasks,
): Promise<void> {
  const armed = await readArmedDefinitionsInForce(tx, tasks);

  const spent = await readSpentOneShots(
    tx,
    armed.map((definition) => ({
      definitionID: definition.definitionID,
      trigger: definition.trigger,
    })),
  );

  const taskDefinitions = await readTaskDefinitionsInForce(tx, tasks);

  await writeDefinitionTasksInTransaction(
    tx,
    context,
    taskDefinitions.filter((definition) => !spent.has(definition.definitionID)),
  );

  const readExtra = await context.readExtraArmed?.(tx);

  const extra = readExtra ?? [];

  await writeArmedDefinitions(tx, context, [
    ...armed.filter((definition) => !spent.has(definition.definitionID)),
    ...extra,
  ]);
}
