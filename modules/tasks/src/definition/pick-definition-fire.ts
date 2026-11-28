import { holdReasons } from '../gate/build-hold-checks';
import { pickRunDefinition } from '../run/pick-run-definition';
import type { RunDefinitionFacts } from '../run/pick-run-definition';
import type { TaskHolds, TaskState } from '../types';

// wait: nixie's pause or the spending stop; the source delivers the fire again. held: the task is
// stopped, closed, done, paused or at a limit, so the fire is skipped. revive: the task failed and
// nothing else holds it, so the fire revives it and opens a fresh task run.
export type DefinitionFire = 'take' | 'revive' | 'still_running' | 'held' | 'wait';

export interface DefinitionFireFacts {
  readonly holds: TaskHolds;
  readonly state: TaskState;
  readonly run: RunDefinitionFacts;
}

// A failed task's own failure never holds a fire of its definition, so one failed run cannot stop
// the schedule. Every other hold keeps its order of the gate.
export function pickDefinitionFire(facts: DefinitionFireFacts): DefinitionFire {
  const isFailed = facts.state === 'failed';

  const reason = holdReasons.find(
    (candidate) => facts.holds[candidate] && !(candidate === 'ended' && isFailed),
  );

  if (reason !== undefined) {
    return reason === 'nixie' || reason === 'spend' ? 'wait' : 'held';
  }

  if (isFailed) {
    return 'revive';
  }

  const isPending = pickRunDefinition(facts.run).kind === 'open';
  const isWorking = facts.run.open !== null && facts.run.open.phase !== 'idle';

  return isPending || isWorking ? 'still_running' : 'take';
}
