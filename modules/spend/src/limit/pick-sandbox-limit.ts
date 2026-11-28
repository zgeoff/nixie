import type { SandboxLimit } from '../types';

const maxMicros = 1_000_000_000_000_000;

export interface SandboxLimitFacts {
  // the sandbox's count when the step began, in whole micros
  readonly startMicros: number;

  // what the task run may still spend: its limit less its dollars, less the planned dollars of the
  // worker runs going and what the worker runs of this step charged; Infinity for a task run with no
  // dollar limit
  readonly leftDollars: number;
}

// The sandbox may spend what the task run has left on top of its count at the step's start, rounded
// down to whole micros. A limit past a billion dollars takes a billion, because the sum would
// overflow to a value that JSON writes as null. No dollar limit leaves the sandbox none.
export function pickSandboxLimit(facts: SandboxLimitFacts): SandboxLimit | null {
  if (!Number.isFinite(facts.leftDollars)) {
    return null;
  }

  const leftMicros = Math.floor(Number((Math.max(0, facts.leftDollars) * 1_000_000).toFixed(3)));

  return { dollars: Math.min(maxMicros, facts.startMicros + leftMicros) / 1_000_000 };
}
