import type { Clock } from '@heynixie/clock';
import type { ProposalContext, ProposalLapseSweep } from '@heynixie/proposals';
import { startProposalLapseSweep } from '@heynixie/proposals';
import { writeActionProposalLapses } from './write-action-proposal-lapses';

export interface ActionLapseSweepOptions {
  readonly context: ProposalContext;
  readonly clock: Clock;
  readonly onError: (error: unknown) => void;
}

export function startActionLapseSweep(options: ActionLapseSweepOptions): ProposalLapseSweep {
  return startProposalLapseSweep({
    sweep: () => writeActionProposalLapses(options.context),
    clock: options.clock,
    onError: options.onError,
  });
}
