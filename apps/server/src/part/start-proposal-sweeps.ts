import type { Clock } from '@heynixie/clock';
import type { ProposalCoreDeps, ProposalLapseSweep } from '@heynixie/proposals';
import {
  runProposalLapses,
  runProposalReturns,
  startProposalLapseSweep,
} from '@heynixie/proposals';

interface ProposalSweepOptions {
  readonly deps: ProposalCoreDeps;
  readonly clock: Clock;
  readonly onError: (error: unknown) => void;
}

const returnPollMs = 30_000;

// One sweep closes every kind's rows past their lapse, and one timer brings back each deferred row
// whose return time passed. Both read the shared rows, so a restart loses nothing.
export function startProposalSweeps(options: ProposalSweepOptions): ProposalLapseSweep {
  const lapses = startProposalLapseSweep({
    sweep: () => runProposalLapses(options.deps),
    clock: options.clock,
    onError: options.onError,
  });

  const returns = startProposalLapseSweep({
    sweep: () => runProposalReturns(options.deps),
    clock: options.clock,
    intervalMs: returnPollMs,
    onError: options.onError,
  });

  return {
    stop: async () => {
      await lapses.stop();
      await returns.stop();
    },
  };
}
