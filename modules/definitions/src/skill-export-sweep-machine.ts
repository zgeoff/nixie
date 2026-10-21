import type { Clock } from '@heynixie/clock';
import { assign, fromCallback, fromPromise, setup } from 'xstate';

export interface SkillExportSweepMachineInput {
  readonly sweep: () => Promise<unknown>;

  readonly clock: Clock;

  readonly intervalMs: number;

  readonly onError: (error: unknown) => void;
}

interface SkillExportSweepContext {
  readonly input: SkillExportSweepMachineInput;

  readonly isWoken: boolean;

  readonly isStopping: boolean;
}

type SkillExportSweepEvent =
  | { readonly type: 'tick' }
  | { readonly type: 'wake' }
  | { readonly type: 'stop' };

const skillExportSweepActors = {
  timer: fromCallback<SkillExportSweepEvent, SkillExportSweepMachineInput>((timer) => {
    const controller = new AbortController();

    void runTimer(timer.input, controller.signal, () => {
      timer.sendBack({ type: 'tick' });
    });

    return () => {
      controller.abort();
    };
  }),
  sweep: fromPromise<unknown, SkillExportSweepMachineInput>((sweep) => sweep.input.sweep()),
};

// xstate's setup takes its type parameters in this order: context, events, actors, children,
// actions, guards, delays, tags, then input.
export const skillExportSweepMachine = setup<
  SkillExportSweepContext,
  SkillExportSweepEvent,
  typeof skillExportSweepActors,
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  never,
  string,
  SkillExportSweepMachineInput
>({ actors: skillExportSweepActors }).createMachine({
  id: 'skillExportSweep',
  context: (start) => ({ input: start.input, isWoken: false, isStopping: false }),

  invoke: {
    // oxlint-disable-next-line zgeoff/no-abbreviated-names -- xstate names the invoked actor `src`
    src: 'timer',
    input: (started) => started.context.input,
  },

  initial: 'sweeping',
  states: {
    waiting: {
      on: {
        tick: { target: 'sweeping' },
        wake: { target: 'sweeping' },
        stop: { target: 'stopped' },
      },
    },
    sweeping: {
      entry: assign({ isWoken: false }),
      invoke: {
        // oxlint-disable-next-line zgeoff/no-abbreviated-names -- xstate names the invoked actor `src`
        src: 'sweep',
        input: (entered) => entered.context.input,
        onDone: [
          { guard: (swept) => swept.context.isStopping, target: 'stopped' },
          { guard: (swept) => swept.context.isWoken, target: 'sweeping', reenter: true },
          { target: 'waiting' },
        ],
        onError: [
          {
            guard: (failed) => failed.context.isStopping,
            target: 'stopped',
            actions: (failed) => {
              reportFailure(failed.context.input, failed.event.error);
            },
          },
          {
            guard: (failed) => failed.context.isWoken,
            target: 'sweeping',
            reenter: true,
            actions: (failed) => {
              reportFailure(failed.context.input, failed.event.error);
            },
          },
          {
            target: 'waiting',
            actions: (failed) => {
              reportFailure(failed.context.input, failed.event.error);
            },
          },
        ],
      },
      on: {
        tick: {},

        wake: { actions: assign({ isWoken: true }) },
        stop: { actions: assign({ isStopping: true }) },
      },
    },
    stopped: { type: 'final' },
  },
});

async function runTimer(
  input: SkillExportSweepMachineInput,
  signal: AbortSignal,
  onTick: () => void,
): Promise<void> {
  while (!signal.aborted) {
    await input.clock.sleep(input.intervalMs, signal);

    if (!signal.aborted) {
      onTick();
    }
  }
}

function reportFailure(input: SkillExportSweepMachineInput, error: unknown): void {
  try {
    input.onError(error);
  } catch {}
}
