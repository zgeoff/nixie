import type { TaskClaim } from './types';

// The run identity of one claim of a step: its step key and its lease's generation. A runner that
// takes over an expired lease runs the same step at the next generation, so the step it replaced
// keeps an identity the new claim no longer matches.
export function buildStepRunID(claim: TaskClaim): string {
  return `${claim.stepKey}@${claim.lease.generation}`;
}
