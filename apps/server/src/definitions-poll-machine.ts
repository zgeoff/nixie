import type { Clock } from '@heynixie/clock';
import { planBackoffDelay } from '@heynixie/retry';
import { machineTypes } from '@zgeoff/std';
import { assign, fromPromise, setup } from 'xstate';

export interface DefinitionsProbe {
  readonly isChanged: boolean;
}

export interface DefinitionsPollOptions {
  readonly probe: () => Promise<string>;

  readonly seed: () => Promise<boolean>;

  readonly isRefused?: () => boolean;

  readonly probeSeedDue?: () => Promise<boolean>;
  readonly clock: Clock;
  readonly intervalMs: number;

  readonly retryDelayMs: number;

  readonly isRefusedAtStart: boolean;

  readonly onProbed: (probed: DefinitionsProbe) => void;
  readonly onError: (error: unknown) => void;
}

interface DefinitionsPollContext {
  readonly options: DefinitionsPollOptions;

  readonly token: string | null;

  readonly failures: number;

  readonly isStopping: boolean;
}

interface ProbeOutcome {
  readonly token: string | null;

  readonly isFailed: boolean;
}

export const definitionsPollMachine = setup({
  types: machineTypes<{
    input: DefinitionsPollOptions;
    context: DefinitionsPollContext;
    events: { type: 'stop' };
  }>(),
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

function planWait(options: DefinitionsPollOptions, failures: number): number {
  return failures === 0
    ? options.intervalMs
    : planBackoffDelay(failures, { firstMs: options.retryDelayMs, maxMs: options.intervalMs });
}

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
