import { systemClock } from '@heynixie/clock';
import { createActor, toPromise } from 'xstate';
import type { SkillExportOptions } from './run-skill-exports';
import { runSkillExports } from './run-skill-exports';
import { skillExportSweepMachine } from './skill-export-sweep-machine';

export interface SkillExportSweepOptions extends SkillExportOptions {
  // how often the sweep retries what failed, hourly by default
  readonly intervalMs?: number;
}

export interface SkillExportSweep {
  // runs the exports now, or once more after the run in flight
  readonly wake: () => void;

  // completes once the run in flight, if any, has finished
  readonly stop: () => Promise<void>;
}

const exportSweepMs = 60 * 60 * 1000;

// Starts the export of the skills that nixie wrote to your definitions repo: one run at start, one
// on each wake after an approval or your choice on a conflict, and one each interval, which tries
// a failed export again. Runs never overlap, and a wake during a run queues one run after it.
export function startSkillExportSweep(options: SkillExportSweepOptions): SkillExportSweep {
  const sweep = createActor(skillExportSweepMachine, {
    input: {
      sweep: () => runSkillExports(options),
      clock: systemClock,
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
