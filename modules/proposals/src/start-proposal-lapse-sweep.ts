import type { Clock } from '@heynixie/clock';
import { createActor, toPromise } from 'xstate';
import { proposalLapseSweepMachine } from './proposal-lapse-sweep-machine';

export interface ProposalLapseSweepOptions {
  readonly sweep: () => Promise<unknown>;

  readonly clock: Clock;

  readonly intervalMs?: number;

  readonly onError: (error: unknown) => void;
}

export interface ProposalLapseSweep {
  readonly stop: () => Promise<void>;
}

const lapseSweepMs = 60 * 60 * 1000;

export function startProposalLapseSweep(options: ProposalLapseSweepOptions): ProposalLapseSweep {
  const sweep = createActor(proposalLapseSweepMachine, {
    input: {
      sweep: options.sweep,

      clock: options.clock,
      intervalMs: options.intervalMs ?? lapseSweepMs,
      onError: options.onError,
    },
  });

  sweep.start();

  return {
    stop: async () => {
      if (sweep.getSnapshot().status === 'active') {
        sweep.send({ type: 'stop' });
      }

      await toPromise(sweep);
    },
  };
}
