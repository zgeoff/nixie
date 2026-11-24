import { match } from 'ts-pattern';
import type { GateCaller, TaskGate } from '../types';
import { pickGateRule } from './pick-gate-rule';

export interface GateWork {
  readonly isStarted: boolean;
}

// Whether the caller leaves the work alone, from the gate that readTaskGate read for the same
// caller.
export function isGateBarring(caller: GateCaller, gate: TaskGate, work: GateWork): boolean {
  if (gate.open) {
    return false;
  }

  return match(pickGateRule(caller, gate.reason))
    .with('skip', () => true)
    .with('skip_unstarted', () => !work.isStarted)
    .with('pass', () => false)
    .exhaustive();
}
