import type { Clock, Sweep } from '@heynixie/clock';
import { startSweep } from '@heynixie/clock';
import type { ProposalCoreDeps } from '@heynixie/proposals';
import { runProposalLapses, runProposalReturns } from '@heynixie/proposals';

interface ProposalSweepOptions {
  readonly deps: ProposalCoreDeps;
  readonly clock: Clock;
  readonly onError: (error: unknown) => void;
}

const lapseSweepMs = 60 * 60 * 1000;
const returnPollMs = 30_000;

// One sweep closes every kind's rows past their lapse, and one timer brings back each deferred row
// whose return time passed. Both read the shared rows, so a restart loses nothing.
export function startProposalSweeps(options: ProposalSweepOptions): Pick<Sweep, 'stop'> {
  const lapses = startSweep({
    clock: options.clock,
    intervalMs: lapseSweepMs,
    run: () => runProposalLapses(options.deps),
    onError: options.onError,
  });

  const returns = startSweep({
    clock: options.clock,
    intervalMs: returnPollMs,
    run: () => runProposalReturns(options.deps),
    onError: options.onError,
  });

  return {
    stop: async () => {
      await lapses.stop();
      await returns.stop();
    },
  };
}
