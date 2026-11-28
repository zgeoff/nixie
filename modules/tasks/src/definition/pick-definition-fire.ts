import { pickRunDefinition } from '../run/pick-run-definition';
import type { RunDefinitionFacts } from '../run/pick-run-definition';
import type { DefinitionHoldFacts } from './pick-definition-hold';
import { pickDefinitionHold } from './pick-definition-hold';

// wait: nixie's pause or the spending stop; the source delivers the fire again. held: the task is
// stopped, closed, done, paused or at a limit, so the fire is skipped. revive: the task failed and
// nothing else holds it, so the fire revives it and opens a fresh task run.
export type DefinitionFire = 'take' | 'revive' | 'still_running' | 'held' | 'wait';

export interface DefinitionFireFacts extends DefinitionHoldFacts {
  readonly run: RunDefinitionFacts;
}

// A stopped task outranks nixie's pause and the spending stop, which outrank every other hold, as
// the gate orders its reasons.
export function pickDefinitionFire(facts: DefinitionFireFacts): DefinitionFire {
  const hold = pickDefinitionHold(facts);

  if (hold === 'stopped') {
    return 'held';
  }

  if (facts.holds.spend || facts.holds.nixie) {
    return 'wait';
  }

  if (hold !== null) {
    return 'held';
  }

  if (facts.state === 'failed') {
    return 'revive';
  }

  const isPending = pickRunDefinition(facts.run).kind === 'open';
  const isWorking = facts.run.open !== null && facts.run.open.phase !== 'idle';

  return isPending || isWorking ? 'still_running' : 'take';
}
