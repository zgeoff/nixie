import type { Clock } from '@heynixie/clock';
import type { ProposalContext, ProposalLapseSweep } from '@heynixie/proposals';
import { startProposalLapseSweep } from '@heynixie/proposals';
import { writePromptProposalLapses } from './write-prompt-proposal-lapses';

export interface PromptLapseSweepOptions {
  readonly context: ProposalContext;

  readonly clock: Clock;

  readonly onError: (error: unknown) => void;
}

export function startPromptLapseSweep(options: PromptLapseSweepOptions): ProposalLapseSweep {
  return startProposalLapseSweep({
    sweep: () => writePromptProposalLapses(options.context),
    clock: options.clock,
    onError: options.onError,
  });
}
