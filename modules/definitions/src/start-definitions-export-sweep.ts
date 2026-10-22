import type { Clock } from '@heynixie/clock';
import { systemClock } from '@heynixie/clock';
import { createActor, toPromise } from 'xstate';
import { definitionsExportSweepMachine } from './definitions-export-sweep-machine';
import type { DefinitionsExportOptions } from './run-definitions-exports';
import { runDefinitionsExports } from './run-definitions-exports';

export interface DefinitionsExportSweepOptions extends DefinitionsExportOptions {
  readonly intervalMs?: number;

  readonly clock?: Clock;
}

export interface DefinitionsExportSweep {
  readonly wake: () => void;

  readonly stop: () => Promise<void>;
}

const exportSweepMs = 60 * 60 * 1000;

export function startDefinitionsExportSweep(
  options: DefinitionsExportSweepOptions,
): DefinitionsExportSweep {
  const sweep = createActor(definitionsExportSweepMachine, {
    input: {
      sweep: () => runDefinitionsExports(options),
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
