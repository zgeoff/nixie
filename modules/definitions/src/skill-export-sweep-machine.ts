import type { Clock } from '@heynixie/clock';
import { assign, fromCallback, fromPromise, setup } from 'xstate';

export interface SkillExportSweepMachineInput {
  // exports each skill nixie wrote that your definitions repo lacks
  readonly sweep: () => Promise<unknown>;

  // the clock the timer sleeps on
  readonly clock: Clock;

  // the time between two ticks, each of which starts a sweep unless one still runs
  readonly intervalMs: number;

  // takes each failed sweep; an onError that throws loses only its own report
  readonly onError: (error: unknown) => void;
}

interface SkillExportSweepContext {
  readonly input: SkillExportSweepMachineInput;

  // a wake came while a sweep ran, so one more sweep runs once that sweep ends
  readonly isWoken: boolean;

  // a stop came while a sweep ran, so the machine stops once that sweep ends
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

// xstate's type parameters, in order: context, events, actors, children, actions, guards, delays,
// tags, then input
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

  // the timer runs from start until the machine stops, and the final state stops it
  invoke: {
    // oxlint-disable-next-line zgeoff/no-abbreviated-names -- xstate names the invoked actor `src`
    src: 'timer',
    input: (started) => started.context.input,
  },

  // a sweep runs at start, so a skill approved before a restart exports without a wake
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
        // the sweep in flight covers this tick, so the tick starts no second one
        tick: {},

        // the sweep in flight may have read the store before the change that woke it
        wake: { actions: assign({ isWoken: true }) },
        stop: { actions: assign({ isStopping: true }) },
      },
    },
    stopped: { type: 'final' },
  },
});

// ticks once each interval until the signal aborts, and the tick due at the abort never comes
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
  } catch {
    // an onError that throws loses only its own report, and the next tick still sweeps
  }
}
