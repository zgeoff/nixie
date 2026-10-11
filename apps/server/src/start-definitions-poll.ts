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

// Probes the definitions source every interval and seeds again on a new probe token. Each probe
// and seed finishes before the next starts, so 2 seeds never overlap and an older revision never
// commits after a newer one.
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
  // the probe token the last seed ran for
  const state: { token: string | null } = { token: null };

  while (!signal.aborted) {
    // oxlint-disable-next-line no-await-in-loop -- the poll waits between probes
    await waitForInterval(options.intervalMs, signal);
    if (signal.aborted) {
      return;
    }

    // oxlint-disable-next-line no-await-in-loop -- one probe and seed at a time
    state.token = await runProbe(options, state.token);
  }
}

// Probes once and seeds on a new token. It returns the token the last good seed ran for, so a
// failed probe or seed probes the same token again next interval.
async function runProbe(
  options: DefinitionsPollOptions,
  lastToken: string | null,
): Promise<string | null> {
  try {
    const token = await options.probe();

    if (token !== lastToken) {
      await options.seed();
    }
    return token;
  } catch (error) {
    options.onError(error);
    return lastToken;
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
