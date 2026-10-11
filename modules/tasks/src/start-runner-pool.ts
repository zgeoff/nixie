import type { Clock } from './types';
import { waitAtFaultPoint } from './wait-at-fault-point';

export interface RunnerPoolOptions<W> {
  // how many pieces of work run at once
  readonly size: number;

  // how long an idle runner sleeps before it tries to claim again, unless woken
  readonly pollMs: number;
  readonly claim: () => Promise<W | null>;
  readonly run: (work: W) => Promise<void>;

  // a claim or a run threw, such as a StaleWriterError; the pool has stopped claiming
  readonly onError: (error: unknown) => void;
}

export interface RunnerPool {
  // ends every idle runner's sleep, so new work is claimed at once
  readonly wake: () => void;

  // stops claiming, then waits up to graceMs for the work in flight; work still running at the
  // deadline is left to recover as after a crash
  readonly stop: (graceMs?: number) => Promise<void>;
}

// Starts a fixed pool of runners over one claim path. Task steps and action attempts each run in a
// pool of their own, so a send goes out while every task runner is busy with a long turn.
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

// the 30 s a graceful stop gives the steps in flight to commit
const DEFAULT_GRACE_MS = 30_000;

interface RunnerState {
  readonly stopping: AbortSignal;
  readonly getWakeSignal: () => AbortSignal;

  // counts the runners inside a claim or a run, which a graceful stop waits for
  readonly updateBusy: (change: number) => void;
  readonly onError: (error: unknown) => void;
}

// one runner: claim and run until the pool stops, sleeping between claims that find no work
async function runRunner<W>(
  clock: Clock,
  options: RunnerPoolOptions<W>,
  state: RunnerState,
): Promise<void> {
  try {
    while (!state.stopping.aborted) {
      // oxlint-disable-next-line no-await-in-loop -- a runner holds one piece of work at a time
      if (!(await runClaim(options, state))) {
        // oxlint-disable-next-line no-await-in-loop -- an idle runner polls
        await clock.sleep(options.pollMs, AbortSignal.any([state.stopping, state.getWakeSignal()]));
      }
    }
  } catch (error) {
    state.onError(error);
  }
}

// claims one piece of work and runs it, and tells whether there was any
async function runClaim<W>(options: RunnerPoolOptions<W>, state: RunnerState): Promise<boolean> {
  state.updateBusy(1);
  try {
    const work = await options.claim();

    if (work === null) {
      return false;
    }
    await options.run(work);
    return true;
  } finally {
    state.updateBusy(-1);
  }
}
