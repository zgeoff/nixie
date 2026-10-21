import type { MemoryConsolidations } from './consolidation-types';
import type { MemoryProposals } from './gate-types';

export interface LapseSweepOptions {
  readonly store: {
    readonly proposals: Pick<MemoryProposals, 'lapse'>;
    readonly consolidations: Pick<MemoryConsolidations, 'lapse'>;
  };

  readonly intervalMs?: number;

  readonly onError: (error: unknown) => void;
}

export interface LapseSweep {
  readonly stop: () => Promise<void>;
}

const lapseSweepMs = 60 * 60 * 1000;

export function startLapseSweep(options: LapseSweepOptions): LapseSweep {
  let running: Promise<void> | null = null;

  const sweep = setInterval(() => {
    running ??= (async () => {
      try {
        await runLapseSweep(options);
      } catch {
        // A throw from onError loses only its own report, and the next sweep still runs.
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
