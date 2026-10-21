import type { TaskClaim } from './types';

export function buildStepRunID(claim: TaskClaim): string {
  return `${claim.stepKey}@${claim.lease.generation}`;
}
