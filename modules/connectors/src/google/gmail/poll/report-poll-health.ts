import { pickPollHealth } from './pick-poll-health';
import type { PollRun, PollState } from './types';

// Reports the health of the polled connections. A connection that needs consent is no part of it:
// the owner sees that in the connection's own status, and it must not hold the source unhealthy
// while the others poll fine.
export function reportPollHealth(run: PollRun, states: readonly PollState[]): void {
  const health = pickPollHealth(states.map((state) => state.failures));

  if (health !== null) {
    run.trigger.reportHealth(health);
  }
}
