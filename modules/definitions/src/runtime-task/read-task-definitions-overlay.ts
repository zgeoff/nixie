import type { Kysely } from 'kysely';
import { readDefinitionsInForce } from '../definition/read-definitions-in-force';
import { readRepoTasks } from '../seed/read-repo-tasks';
import type { OverlaidTaskDefinition } from '../utils/build-task-seed-plan';
import { buildTaskSeedPlan } from '../utils/build-task-seed-plan';
import { readTaskSeedInput } from './read-task-seed-input';

// The task definitions as they stand: the runtime changes in force laid over the repo's list at the
// last accepted seed. Nothing stores this list, so each read lays it again. A definition that a
// change removes or whose version is unreadable is in the list and out of force.
export async function readTaskDefinitionsOverlay(
  db: Kysely<unknown>,
): Promise<readonly OverlaidTaskDefinition[]> {
  const inForce = await readDefinitionsInForce(db);

  if (inForce === null) {
    return [];
  }

  const repo = await readRepoTasks(db, inForce);
  const input = await readTaskSeedInput(db, repo);

  return buildTaskSeedPlan(input).definitions;
}
