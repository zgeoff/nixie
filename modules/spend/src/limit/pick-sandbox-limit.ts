import type { SandboxLimit } from '../types';

export interface SandboxLimitFacts {
  // the sandbox's count when the step began, in whole micros
  readonly startMicros: number;

  // what the task run may still spend: its limit less its dollars, less the planned dollars of the
  // worker runs going and what the worker runs of this step charged
  readonly leftDollars: number;
}

// The sandbox may spend what the task run has left on top of the count it began the step with. The
// gateway compares in whole micros, so the left dollars round down and never allow a micro more.
export function pickSandboxLimit(facts: SandboxLimitFacts): SandboxLimit {
  const leftMicros = Math.floor(Number((Math.max(0, facts.leftDollars) * 1_000_000).toFixed(3)));

  return { dollars: (facts.startMicros + leftMicros) / 1_000_000 };
}
