import { systemClock } from '@heynixie/clock';
import { createActor, toPromise } from 'xstate';
import { skillLapseSweepMachine } from './skill-lapse-sweep-machine';
import type { SkillProposalContext } from './types';
import { writeSkillProposalLapses } from './write-skill-proposal-lapses';

export interface SkillLapseSweepOptions {
  readonly context: SkillProposalContext;

  // how often the sweep runs, hourly by default
  readonly intervalMs?: number;

  // a sweep that fails is logged, and the next one tries again
  readonly onError: (error: unknown) => void;
}

export interface SkillLapseSweep {
  // completes once the sweep in flight, if any, has finished
  readonly stop: () => Promise<void>;
}

const lapseSweepMs = 60 * 60 * 1000;

// Starts the sweep that records the lapse of each skill proposal past its lapse time, so the
// conversation hears of it in its next turn. A sweep still running when the next one is due lets
// that one pass.
export function startSkillLapseSweep(options: SkillLapseSweepOptions): SkillLapseSweep {
  const sweep = createActor(skillLapseSweepMachine, {
    input: {
      sweep: () => writeSkillProposalLapses(options.context),

      // the interval passes on the wall clock; the context's clock only dates each lapse
      clock: systemClock,
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
