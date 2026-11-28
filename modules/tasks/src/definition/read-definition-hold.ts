import type { Kysely } from 'kysely';
import { readTaskHolds } from '../gate/read-task-holds';
import type { TasksTables } from '../types';
import type { DefinitionHold } from './pick-definition-hold';
import { pickDefinitionHold } from './pick-definition-hold';
import { probePauseUnanswered } from './probe-pause-unanswered';

// Why the task of the definition holds its fires, or null when it holds none or no task is bound.
export async function readDefinitionHold(
  db: Kysely<unknown>,
  definitionID: string,
): Promise<DefinitionHold | null> {
  const task = await db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['task_id', 'state'])
    .where('definition_id', '=', definitionID)
    .executeTakeFirst();

  if (task === undefined) {
    return null;
  }

  const holds = await readTaskHolds(db, task.task_id);
  const isPauseUnanswered = await probePauseUnanswered(db, task.task_id);

  return pickDefinitionHold({ holds, state: task.state, isPauseUnanswered });
}
