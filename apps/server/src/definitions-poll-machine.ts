import type { Clock } from '@heynixie/clock';
import { planBackoffDelay } from '@heynixie/retry';
import { assign, fromPromise, setup } from 'xstate';

export interface DefinitionsProbe {
  // the token differs from the one the last good seed ran for, so a seed follows
  readonly isChanged: boolean;
}

export interface DefinitionsPollOptions {
  // the source's probe token, which changes when the definitions change
  readonly probe: () => Promise<string>;

  // resolves false when the seed refused the source's snapshot
  readonly seed: () => Promise<boolean>;

  // a refused snapshot is pending from a seed outside the poll, such as a skill reload's, so the
  // next probe seeds even on the token of the poll's last good seed; none when absent
  readonly isRefused?: () => boolean;

  // a change the database holds is not in force yet, such as an approval whose seed failed, so
  // the next probe seeds on an unchanged token; none when absent
  readonly probeSeedDue?: () => Promise<boolean>;
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

interface DefinitionsPollContext {
  readonly options: DefinitionsPollOptions;

  // the probe token the last good seed ran for
  readonly token: string | null;

  // the failures in a row, which is 0 while the last probe and seed succeeded
  readonly failures: number;

  // a stop came while a probe ran, so the poll stops once that probe and its seed end
  readonly isStopping: boolean;
}

interface ProbeOutcome {
  // the probe token the last good seed ran for, or null after a refused seed
  readonly token: string | null;

  // the probe threw or the seed was refused, so the next probe comes sooner
  readonly isFailed: boolean;
}

// The definitions poll: it waits, probes the source and seeds on a new token, then waits again. A
// stop ends a wait at once, and ends a probe only after the probe and its seed finish, so 2 seeds
// never overlap and an older revision never commits after a newer one.
export const definitionsPollMachine = setup({
  types: {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- xstate reads these types only at compile time
    input: {} as DefinitionsPollOptions,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- xstate reads these types only at compile time
    context: {} as DefinitionsPollContext,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- xstate reads these types only at compile time
    events: {} as { type: 'stop' },
  },
  actors: {
    wait: fromPromise<void, DefinitionsPollContext>((wait) =>
      wait.input.options.clock.sleep(
        planWait(wait.input.options, wait.input.failures),
        wait.signal,
      ),
    ),
    probe: fromPromise<ProbeOutcome, DefinitionsPollContext>((probe) =>
      runProbe(probe.input.options, probe.input.token),
    ),
  },
}).createMachine({
  id: 'definitionsPoll',
  context: (start) => ({
    options: start.input,
    token: null,
    failures: start.input.isRefusedAtStart ? 1 : 0,
    isStopping: false,
  }),
  initial: 'waiting',
  states: {
    waiting: {
      invoke: {
        // oxlint-disable-next-line zgeoff/no-abbreviated-names -- xstate names the invoked actor `src`
        src: 'wait',
        input: (entered) => entered.context,
        onDone: { target: 'probing' },
      },
      on: { stop: { target: 'stopped' } },
    },
    probing: {
      invoke: {
        // oxlint-disable-next-line zgeoff/no-abbreviated-names -- xstate names the invoked actor `src`
        src: 'probe',
        input: (entered) => entered.context,
        onDone: [
          {
            guard: (probed) => probed.context.isStopping,
            target: 'stopped',
          },
          {
            target: 'waiting',
            actions: assign((probed) => ({
              token: probed.event.output.token,
              failures: probed.event.output.isFailed ? probed.context.failures + 1 : 0,
            })),
          },
        ],
      },
      on: { stop: { actions: assign({ isStopping: true }) } },
    },
    stopped: { type: 'final' },
  },
});

// the interval while the probes succeed; after a failure the retry delay, which doubles with each
// failure after it, and no wait passes the interval
function planWait(options: DefinitionsPollOptions, failures: number): number {
  return failures === 0
    ? options.intervalMs
    : planBackoffDelay(failures, { firstMs: options.retryDelayMs, maxMs: options.intervalMs });
}

// Probes once and seeds on a new token. A refused seed clears the token, so the next probe seeds what
// it finds even when that is the revision of the last good seed, which clears the refusal. A refusal
// from a seed outside the poll leaves the token, so the probe seeds on it as well.
async function runProbe(
  options: DefinitionsPollOptions,
  lastToken: string | null,
): Promise<ProbeOutcome> {
  try {
    const token = await options.probe();

    const isChanged = token !== lastToken;

    options.onProbed({ isChanged });

    const isDue = isChanged || (options.isRefused?.() ?? false);

    const isPending =
      isDue || options.probeSeedDue === undefined ? false : await options.probeSeedDue();

    const needsSeed = isDue || isPending;

    if (needsSeed && !(await options.seed())) {
      return { token: null, isFailed: true };
    }

    return { token, isFailed: false };
  } catch (error) {
    options.onError(error);

    return { token: lastToken, isFailed: true };
  }
}
