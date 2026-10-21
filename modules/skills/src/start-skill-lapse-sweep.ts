import { systemClock } from '@heynixie/clock';
import { createActor, toPromise } from 'xstate';
import { skillLapseSweepMachine } from './skill-lapse-sweep-machine';
import type { SkillProposalContext } from './types';
import { writeSkillProposalLapses } from './write-skill-proposal-lapses';

export interface SkillLapseSweepOptions {
  readonly context: SkillProposalContext;

  readonly intervalMs?: number;

  readonly onError: (error: unknown) => void;
}

export interface SkillLapseSweep {
  readonly stop: () => Promise<void>;
}

const lapseSweepMs = 60 * 60 * 1000;

export function startSkillLapseSweep(options: SkillLapseSweepOptions): SkillLapseSweep {
  const sweep = createActor(skillLapseSweepMachine, {
    input: {
      sweep: () => writeSkillProposalLapses(options.context),

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
