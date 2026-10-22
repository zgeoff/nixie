import type { Clock } from '@heynixie/clock';
import { systemClock } from '@heynixie/clock';
import { createActor, toPromise } from 'xstate';
import type { SkillExportOptions } from './run-skill-exports';
import { runSkillExports } from './run-skill-exports';
import { skillExportSweepMachine } from './skill-export-sweep-machine';
import type { SkillExportText } from './types';

export interface SkillExportSweepOptions extends SkillExportOptions {
  readonly text: SkillExportText;

  readonly intervalMs?: number;

  readonly clock?: Clock;
}

export interface SkillExportSweep {
  readonly wake: () => void;

  readonly stop: () => Promise<void>;
}

const exportSweepMs = 60 * 60 * 1000;

export function startSkillExportSweep(options: SkillExportSweepOptions): SkillExportSweep {
  const sweep = createActor(skillExportSweepMachine, {
    input: {
      sweep: () => runSkillExports(options),
      clock: options.clock ?? systemClock,
      intervalMs: options.intervalMs ?? exportSweepMs,
      onError: options.onError,
    },
  });

  sweep.start();

  return {
    wake: () => {
      if (sweep.getSnapshot().status === 'active') {
        sweep.send({ type: 'wake' });
      }
    },
    stop: async () => {
      if (sweep.getSnapshot().status === 'active') {
        sweep.send({ type: 'stop' });
      }

      await toPromise(sweep);
    },
  };
}
