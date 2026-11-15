import { actionProposalLapseMs } from './action-proposal-lapse-ms';

// A proposal lapses at the default interval, or at its deadline when that comes first.
export function pickActionLapse(now: number, deadlineAt: number | null): number {
  const lapsesAt = now + actionProposalLapseMs;

  return deadlineAt === null ? lapsesAt : Math.min(lapsesAt, deadlineAt);
}
