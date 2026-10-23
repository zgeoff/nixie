import type { GateLimits } from './gate-types';

export function buildProposalLapseTime(
  now: number,
  limits: Pick<GateLimits, 'proposalLapseMs'>,
  until: number | null | undefined,
): number {
  const lapseAt = now + limits.proposalLapseMs;

  return until === undefined || until === null ? lapseAt : Math.min(lapseAt, until);
}
