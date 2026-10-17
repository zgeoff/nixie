import type { Clock } from '@heynixie/clock';
import { planBackoffDelay } from '@heynixie/retry';

export interface DefinitionsProbe {
  // the token differs from the one the last good seed ran for, so a seed follows
  readonly isChanged: boolean;
}

export interface DefinitionsPollOptions {
  // the source's probe token, which changes when the definitions change
  readonly probe: () => Promise<string>;

  // resolves false when the seed refused the source's snapshot
  readonly seed: () => Promise<boolean>;
  readonly clock: Clock;
  readonly intervalMs: number;

  // the first wait after a failed probe or a refused seed, which doubles up to intervalMs, so a
  // source that is not checked out yet seeds within seconds of its checkout
  readonly retryDelayMs: number;

  // the seed at start was refused, so the first probe follows the retry wait, not the interval
  readonly isRefusedAtStart: boolean;

  // takes each probe that answered, whether or not its token was new, so every interval leaves a
  // trace even when the definitions never change
  readonly onProbed: (probed: DefinitionsProbe) => void;
  readonly onError: (error: unknown) => void;
}

export interface DefinitionsPoll {
  // ends the poll, after the seed in flight if one runs
  readonly stop: () => Promise<void>;
}

// Probes the definitions source every interval, or sooner after a failure, and seeds again on a new
// probe token. Each probe and seed finishes before the next starts, so 2 seeds never overlap and an
// older revision never commits after a newer one.
export function startDefinitionsPoll(options: DefinitionsPollOptions): DefinitionsPoll {
  const stopping = new AbortController();

  const loop = runPoll(options, stopping.signal);

  return {
    stop: async () => {
      stopping.abort();

      await loop;
    },
  };
}

async function runPoll(options: DefinitionsPollOptions, signal: AbortSignal): Promise<void> {
  // the probe token the last good seed ran for, and the failures in a row, which is 0 while the
  // last probe and seed succeeded
  const state: { token: string | null; failures: number } = {
    token: null,
    failures: options.isRefusedAtStart ? 1 : 0,
  };

  while (!signal.aborted) {
    await options.clock.sleep(planWait(options, state.failures), signal);

    if (signal.aborted) {
      return;
    }

    const probed = await runProbe(options, state.token);

    state.token = probed.token;
    state.failures = probed.isFailed ? state.failures + 1 : 0;
  }
}

// the interval while the probes succeed; after a failure the retry delay, which doubles with each
// failure after it, and no wait passes the interval
function planWait(options: DefinitionsPollOptions, failures: number): number {
  return failures === 0
    ? options.intervalMs
    : planBackoffDelay(failures, { firstMs: options.retryDelayMs, maxMs: options.intervalMs });
}

interface ProbeOutcome {
  // the probe token the last good seed ran for, or null after a refused seed
  readonly token: string | null;

  // the probe threw or the seed was refused, so the next probe comes sooner
  readonly isFailed: boolean;
}

// Probes once and seeds on a new token. A refused seed clears the token, so the next probe seeds what
// it finds even when that is the revision of the last good seed, which clears the refusal.
async function runProbe(
  options: DefinitionsPollOptions,
  lastToken: string | null,
): Promise<ProbeOutcome> {
  try {
    const token = await options.probe();

    const isChanged = token !== lastToken;

    options.onProbed({ isChanged });

    if (isChanged && !(await options.seed())) {
      return { token: null, isFailed: true };
    }

    return { token, isFailed: false };
  } catch (error) {
    options.onError(error);

    return { token: lastToken, isFailed: true };
  }
}
