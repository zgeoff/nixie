import type { Transaction } from 'kysely';
import { pickRunDefinition } from '../run/pick-run-definition';
import type { DefinitionRunFacts } from '../run/read-definition-run-facts';
import { readDefinitionRunFacts } from '../run/read-definition-run-facts';
import type { TasksTables } from '../types';

export type DefinitionFire = 'take' | 'still_running' | 'held';

export interface DefinitionTaskAnswer {
  readonly taskID: string;
  readonly fire: DefinitionFire;
}

// What the trigger core does with a fire of the definition, from the task's state and the task run
// that the next claim would open. The caller holds the transaction that delivers the fire. It reads
// neither the nixie pause nor a recovery hold. Returns null when no task is bound to the definition.
export async function readDefinitionTaskInTransaction(
  tx: Transaction<unknown>,
  definitionID: string,
): Promise<DefinitionTaskAnswer | null> {
  const taskID = await readTaskID(tx, definitionID);

  if (taskID === null) {
    return null;
  }

  const read = await readDefinitionRunFacts(tx, taskID);

  return read === null ? null : { taskID, fire: pickDefinitionFire(read) };
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

const heldStates = new Set(['paused', 'stopped', 'failed']);

function pickDefinitionFire(read: DefinitionRunFacts): DefinitionFire {
  if (heldStates.has(read.state) || read.facts.isLimitHeld) {
    return 'held';
  }

  const isPending = pickRunDefinition(read.facts).kind === 'open';
  const isWorking = read.facts.open !== null && read.facts.open.phase !== 'idle';

  return isPending || isWorking ? 'still_running' : 'take';
}
