import type { Clock, Sweep } from '@heynixie/clock';
import { startSweep } from '@heynixie/clock';
import type { MemoryProposals } from '../gate/gate-context';
import type { MemoryStore } from '../types';

export interface LapseSweepOptions {
  readonly store: Pick<MemoryStore, 'lapse'> & {
    readonly proposals: Pick<MemoryProposals, 'lapse'>;
  };

  readonly clock: Clock;

  readonly intervalMs?: number;

  readonly onError: (error: unknown) => void;
}

export type LapseSweep = Sweep;

const lapseSweepMs = 60 * 60 * 1000;

export function startLapseSweep(options: LapseSweepOptions): LapseSweep {
  return startSweep({
    clock: options.clock,
    intervalMs: options.intervalMs ?? lapseSweepMs,
    run: () => runLapseSweep(options),
    onError: options.onError,
  });
}

async function runLapseSweep(options: LapseSweepOptions): Promise<void> {
  await tryRunLapse(() => options.store.lapse(), options.onError);
  await tryRunLapse(() => options.store.proposals.lapse(), options.onError);
}

async function tryRunLapse(
  lapse: () => Promise<number>,
  onError: LapseSweepOptions['onError'],
): Promise<void> {
  try {
    await lapse();
  } catch (error) {
    // A throw from onError is swallowed here: the shared loop would report it to the same onError.
    try {
      onError(error);
    } catch {}
  }
}
