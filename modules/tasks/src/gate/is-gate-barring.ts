import { match } from 'ts-pattern';
import type { GateCaller, TaskHolds } from '../types';
import { holdReasons } from './build-hold-checks';
import { pickGateRule } from './pick-gate-rule';

export interface GateWork {
  readonly isStarted: boolean;
}

// Whether the caller leaves the work alone, from the holds that stand on its task.
export function isGateBarring(caller: GateCaller, holds: TaskHolds, work: GateWork): boolean {
  return holdReasons.some((reason) =>
    match(pickGateRule(caller, reason))
      .with('skip', () => holds[reason])
      .with('skip_unstarted', () => holds[reason] && !work.isStarted)
      .with('pass', () => false)
      .exhaustive(),
  );
}
