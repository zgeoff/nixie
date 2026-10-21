import type { Clock } from '@heynixie/clock';
import { waitAtFaultPoint } from './wait-at-fault-point';

export interface RunnerPoolOptions<W> {
  readonly size: number;

  readonly pollMs: number;
  readonly claim: () => Promise<W | null>;
  readonly run: (work: W) => Promise<void>;

  readonly onError: (error: unknown) => void;
}

export interface RunnerPool {
  readonly wake: () => void;

  readonly stop: (graceMs?: number) => Promise<void>;
}

const DEFAULT_GRACE_MS = 30_000;

interface RunnerState {
  readonly stopping: AbortSignal;
  readonly getWakeSignal: () => AbortSignal;

  readonly updateBusy: (change: number) => void;
  readonly onError: (error: unknown) => void;
}

export function startRunnerPool<W>(clock: Clock, options: RunnerPoolOptions<W>): RunnerPool {
  const stopping = new AbortController();

  const waking = { controller: new AbortController() };
  const busy = { count: 0 };

  const state: RunnerState = {
    stopping: stopping.signal,
    getWakeSignal: () => waking.controller.signal,
    updateBusy: (change) => {
      busy.count += change;
    },
    onError: (error) => {
      stopping.abort();
      options.onError(error);
    },
  };

  const runners = Array.from({ length: options.size }, () => runRunner(clock, options, state));

  return {
    wake: () => {
      waking.controller.abort();

      waking.controller = new AbortController();
    },
    stop: async (graceMs = DEFAULT_GRACE_MS) => {
      stopping.abort();

      if (NIXIE_TEST_BUILD && busy.count > 0) {
        await waitAtFaultPoint('sigterm.grace', { kind: 'pool', id: null });
      }

      const grace = new AbortController();

      await Promise.race([Promise.all(runners), clock.sleep(graceMs, grace.signal)]);

      grace.abort();
    },
  };
}

async function runRunner<W>(
  clock: Clock,
  options: RunnerPoolOptions<W>,
  state: RunnerState,
): Promise<void> {
  try {
    while (!state.stopping.aborted) {
      if (!(await runClaim(options, state))) {
        await clock.sleep(options.pollMs, AbortSignal.any([state.stopping, state.getWakeSignal()]));
      }
    }
  } catch (error) {
    state.onError(error);
  }
}

async function runClaim<W>(options: RunnerPoolOptions<W>, state: RunnerState): Promise<boolean> {
  state.updateBusy(1);

  try {
    const work = await options.claim();

    if (work === null) {
      return false;
    }

    if (!state.stopping.aborted) {
      await options.run(work);
    }

    return true;
  } finally {
    state.updateBusy(-1);
  }
}
