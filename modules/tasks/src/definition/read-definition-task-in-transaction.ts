import type { Transaction } from 'kysely';
import { readTaskHolds } from '../gate/read-task-holds';
import { readDefinitionRunFacts } from '../run/read-definition-run-facts';
import type { TasksTables } from '../types';
import type { DefinitionFire } from './pick-definition-fire';
import { pickDefinitionFire } from './pick-definition-fire';

export interface DefinitionTaskAnswer {
  readonly taskID: string;
  readonly fire: DefinitionFire;
}

// What the trigger core does with a fire of the definition, from the task's holds and the task run
// that the next claim would open. The caller holds the transaction that delivers the fire. Returns
// null when no task is bound to the definition.
export async function readDefinitionTaskInTransaction(
  tx: Transaction<unknown>,
  definitionID: string,
): Promise<DefinitionTaskAnswer | null> {
  const taskID = await readTaskID(tx, definitionID);

  if (taskID === null) {
    return null;
  }

  const read = await readDefinitionRunFacts(tx, taskID);

  if (read === null) {
    return null;
  }

  const holds = await readTaskHolds(tx, taskID);
  const isPauseUnanswered = await probePauseUnanswered(tx, taskID);

  return {
    taskID,
    fire: pickDefinitionFire({ holds, state: read.state, run: read.facts, isPauseUnanswered }),
  };
}

async function readTaskID(tx: Transaction<unknown>, definitionID: string): Promise<string | null> {
  const row = await tx
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select('task_id')
    .where('definition_id', '=', definitionID)
    .executeTakeFirst();

  return row?.task_id ?? null;
}

// A step that fails clears the task's pause request and writes no task.paused, so only the
// thread's newest pause or restart record shows that the user's pause still stands.
async function probePauseUnanswered(tx: Transaction<unknown>, taskID: string): Promise<boolean> {
  const row = await tx
    .$extendTables<TasksTables>()
    .selectFrom('records')
    .select('kind')
    .where('thread', '=', taskID)
    .where('kind', 'in', [
      'task.pause_requested',
      'task.paused',
      'task.resumed',
      'task.restarted',
      'task.revived',
    ])
    .orderBy('sequence', 'desc')
    .limit(1)
    .executeTakeFirst();

  return row?.kind === 'task.pause_requested';
}
