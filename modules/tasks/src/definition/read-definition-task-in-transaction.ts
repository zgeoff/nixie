import type { Transaction } from 'kysely';
import { readTaskGate } from '../gate/read-task-gate';
import { pickRunDefinition } from '../run/pick-run-definition';
import type { DefinitionRunFacts } from '../run/read-definition-run-facts';
import { readDefinitionRunFacts } from '../run/read-definition-run-facts';
import type { TaskGate, TasksTables } from '../types';

// wait: nixie is paused or the spending stop stands, so the fire writes nothing and waits for the
// source's next delivery. held: the task is ended, paused or at a limit, and the fire is skipped.
export type DefinitionFire = 'take' | 'still_running' | 'held' | 'wait';

export interface DefinitionTaskAnswer {
  readonly taskID: string;
  readonly fire: DefinitionFire;
}

// What the trigger core does with a fire of the definition, from the task's gate and the task run
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

  const gate = await readTaskGate(tx, taskID);

  return { taskID, fire: pickDefinitionFire(read, gate) };
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

function pickDefinitionFire(read: DefinitionRunFacts, gate: TaskGate): DefinitionFire {
  if (!gate.open) {
    return gate.reason === 'nixie' || gate.reason === 'spend' ? 'wait' : 'held';
  }

  const isPending = pickRunDefinition(read.facts).kind === 'open';
  const isWorking = read.facts.open !== null && read.facts.open.phase !== 'idle';

  return isPending || isWorking ? 'still_running' : 'take';
}
