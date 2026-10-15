import type { MemoryConsolidations } from './consolidation-types';
import type { MemoryProposals } from './gate-types';

export interface LapseSweepOptions {
  readonly store: {
    readonly proposals: Pick<MemoryProposals, 'lapse'>;
    readonly consolidations: Pick<MemoryConsolidations, 'lapse'>;
  };

  // how often the sweep runs, hourly by default
  readonly intervalMs?: number;

  // a sweep that fails is logged, and the next one tries again
  readonly onError: (error: unknown) => void;
}

export interface LapseSweep {
  // completes once the sweep in flight, if any, has finished
  readonly stop: () => Promise<void>;
}

// Starts the sweep that lapses each proposal and each consolidation change past its lapse time, so
// none waits on a restart. A sweep still running when the next one is due lets that one pass.
export function startLapseSweep(options: LapseSweepOptions): LapseSweep {
  let running: Promise<void> | null = null;

  const sweep = setInterval(() => {
    running ??= (async () => {
      try {
        await runLapseSweep(options);
      } catch {
        // an onError that throws loses only its own report, and the next sweep still runs
      } finally {
        running = null;
      }
    })();
  }, options.intervalMs ?? lapseSweepMs);

  return {
    stop: async () => {
      clearInterval(sweep);

      await running;
    },
  };
}

const lapseSweepMs = 60 * 60 * 1000;

// each lapse reports its own failure, so a failed proposal lapse never holds back the consolidations
async function runLapseSweep(options: LapseSweepOptions): Promise<void> {
  await tryRunLapse(() => options.store.proposals.lapse(), options.onError);
  await tryRunLapse(() => options.store.consolidations.lapse(), options.onError);
}

async function tryRunLapse(
  lapse: () => Promise<number>,
  onError: LapseSweepOptions['onError'],
): Promise<void> {
  try {
    await lapse();
  } catch (error) {
    onError(error);
  }
}
