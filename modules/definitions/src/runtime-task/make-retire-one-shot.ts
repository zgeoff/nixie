import type { TasksContext } from '@heynixie/tasks';
import { withdrawDefinitionTaskInTransaction } from '@heynixie/tasks';
import type { RetireOneShot } from '@heynixie/triggers';
import { writeOneShotSettle } from './write-one-shot-settle';

// The retireOneShot that the server passes the trigger core: the withdraw of the task and the
// trigger, then the settle of the definition's runtime change in force, when it has one.
export function makeRetireOneShot(context: TasksContext): RetireOneShot {
  return async (tx, definitionID, cause) => {
    await withdrawDefinitionTaskInTransaction(tx, context, definitionID);
    await writeOneShotSettle(tx, context, { definitionID, cause });
  };
}
