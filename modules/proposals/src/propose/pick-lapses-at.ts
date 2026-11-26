import type { ProposalConfig, ProposalKindHandler } from '../answer/proposal-kind-handler';
import type { ProposalFamily } from '../rows/proposal-tables';

const dayMs = 24 * 60 * 60 * 1000;

export interface LapseRequest {
  readonly family: ProposalFamily;
  readonly cause: string;
  readonly fromMs: number;
  readonly deadlineAt: number | null;
}

// A proposal lapses at its deadline or at its start plus its family's lapse, whichever comes
// first. A cause that lapses only at its deadline has no interval.
export function pickLapsesAt(
  config: ProposalConfig,
  handler: Pick<ProposalKindHandler, 'lapseIntervalMs'> | undefined,
  request: LapseRequest,
): number {
  const intervalMs =
    handler === undefined
      ? config.lapseDays[request.family] * dayMs
      : handler.lapseIntervalMs(config, request.cause);

  const byInterval = intervalMs === null ? Number.POSITIVE_INFINITY : request.fromMs + intervalMs;
  const lapsesAt = Math.min(request.deadlineAt ?? Number.POSITIVE_INFINITY, byInterval);

  return Number.isFinite(lapsesAt) ? lapsesAt : Number.MAX_SAFE_INTEGER;
}
