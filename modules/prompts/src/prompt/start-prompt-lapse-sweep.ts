import type { Clock, Sweep } from '@heynixie/clock';
import { startSweep } from '@heynixie/clock';
import type { ProposalContext } from '@heynixie/proposals';
import { writePromptProposalLapses } from './write-prompt-proposal-lapses';

export interface PromptLapseSweepOptions {
  readonly context: ProposalContext;

  readonly clock: Clock;

  readonly onError: (error: unknown) => void;
}

const lapseSweepMs = 60 * 60 * 1000;

export function startPromptLapseSweep(options: PromptLapseSweepOptions): Sweep {
  return startSweep({
    clock: options.clock,
    intervalMs: lapseSweepMs,
    run: () => writePromptProposalLapses(options.context),
    onError: options.onError,
  });
}
