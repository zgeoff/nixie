import { beforeTurnFailures } from './before-turn-failures';

// A step that fails before its model turn, such as in an approved call that runs ahead of it, ran
// no model turn. The step marks that failure, so a runner that finds the spending stop standing
// still counts it as a step error: the stop did not cause it.
export function markBeforeTurnFailure(error: unknown): void {
  if (typeof error === 'object' && error !== null) {
    beforeTurnFailures.add(error);
  }
}
