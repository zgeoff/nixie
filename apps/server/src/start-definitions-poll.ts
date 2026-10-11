export interface DefinitionsPollOptions {
  // the source's probe token, which changes when the definitions change
  readonly probe: () => Promise<string>;
  readonly seed: () => Promise<void>;
  readonly intervalMs: number;
  readonly onError: (error: unknown) => void;
}

export interface DefinitionsPoll {
  // ends the poll, after the seed in flight if one runs
  readonly stop: () => Promise<void>;
}

// the probe token the last seed ran for
interface PollState {
  token: string | null;
}

// Probes the definitions source every interval and seeds again on a new probe token. Each probe
// and seed finishes before the next starts, so 2 seeds never overlap and an older revision never
// commits after a newer one.
export function startDefinitionsPoll(options: DefinitionsPollOptions): DefinitionsPoll {
  const stopping = new AbortController();
  const state: PollState = { token: null };
  const loop = runPoll(options, state, stopping.signal);

  return {
    stop: async () => {
      stopping.abort();
      await loop;
    },
  };
}

async function runPoll(
  options: DefinitionsPollOptions,
  state: PollState,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    // oxlint-disable-next-line no-await-in-loop -- the poll waits between probes
    await waitForInterval(options.intervalMs, signal);
    if (signal.aborted) {
      return;
    }
    try {
      // oxlint-disable-next-line no-await-in-loop -- one probe at a time
      const token = await options.probe();

      if (token !== state.token) {
        // oxlint-disable-next-line no-await-in-loop -- one seed at a time
        await options.seed();
        state.token = token;
      }
    } catch (error) {
      options.onError(error);
    }
  }
}

function waitForInterval(ms: number, signal: AbortSignal): Promise<void> {
  const waited = Promise.withResolvers<void>();
  const timer = setTimeout(waited.resolve, ms);

  signal.addEventListener(
    'abort',
    () => {
      clearTimeout(timer);
      waited.resolve();
    },
    { once: true },
  );
  return waited.promise;
}
