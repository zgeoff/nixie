import invariant from 'tiny-invariant';
import type { SessionGuard } from './make-session-guard';

// The step already holds the task's own guard, so the turn takes the signal that guard gave it.
export function buildHeldSessionGuard(invalidated: AbortSignal): SessionGuard {
  return {
    withTurn: (run) => run(invalidated),
    withInvalidation: () => {
      invariant(false, "a started task's cleanup goes through the task's own guard");
    },
  };
}
