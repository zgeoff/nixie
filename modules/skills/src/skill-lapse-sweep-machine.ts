import type { Clock } from '@heynixie/clock';
import { assign, fromCallback, fromPromise, setup } from 'xstate';

export interface SkillLapseSweepMachineInput {
  // records the lapse of each skill proposal past its lapse time
  readonly sweep: () => Promise<unknown>;

  // the clock the timer sleeps on
  readonly clock: Clock;

  // the time between two ticks, each of which starts a sweep unless one still runs
  readonly intervalMs: number;

  // takes each failed sweep; an onError that throws loses only its own report
  readonly onError: (error: unknown) => void;
}

interface SkillLapseSweepContext {
  readonly input: SkillLapseSweepMachineInput;

  // a stop came while a sweep ran, so the machine stops once that sweep ends
  readonly isStopping: boolean;
}

type SkillLapseSweepEvent = { readonly type: 'tick' } | { readonly type: 'stop' };

// The skill lapse sweep: a tick each interval starts a sweep, and a tick during a sweep passes, so
// 2 sweeps never overlap. A failed sweep goes to onError and the next tick sweeps again. A stop
// ends a wait at once, and ends a sweep only after it.
export const skillLapseSweepMachine = setup({
  types: {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- xstate reads these types only at compile time
    input: {} as SkillLapseSweepMachineInput,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- xstate reads these types only at compile time
    context: {} as SkillLapseSweepContext,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- xstate reads these types only at compile time
    events: {} as SkillLapseSweepEvent,
  },
  actors: {
    timer: fromCallback<SkillLapseSweepEvent, SkillLapseSweepMachineInput>((timer) => {
      const controller = new AbortController();

      void runTimer(timer.input, controller.signal, () => {
        timer.sendBack({ type: 'tick' });
      });

      return () => {
        controller.abort();
      };
    }),
    sweep: fromPromise<unknown, SkillLapseSweepMachineInput>((sweep) => sweep.input.sweep()),
  },
}).createMachine({
  id: 'skillLapseSweep',
  context: (start) => ({ input: start.input, isStopping: false }),

  // the timer runs from start until the machine stops, and the final state stops it
  invoke: {
    // oxlint-disable-next-line zgeoff/no-abbreviated-names -- xstate names the invoked actor `src`
    src: 'timer',
    input: (started) => started.context.input,
  },
  initial: 'waiting',
  states: {
    waiting: {
      on: {
        tick: { target: 'sweeping' },
        stop: { target: 'stopped' },
      },
    },
    sweeping: {
      invoke: {
        // oxlint-disable-next-line zgeoff/no-abbreviated-names -- xstate names the invoked actor `src`
        src: 'sweep',
        input: (entered) => entered.context.input,
        onDone: [
          { guard: (swept) => swept.context.isStopping, target: 'stopped' },
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
        stop: { actions: assign({ isStopping: true }) },
      },
    },
    stopped: { type: 'final' },
  },
});

// ticks once each interval until the signal aborts, and the tick due at the abort never comes
async function runTimer(
  input: SkillLapseSweepMachineInput,
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

function reportFailure(input: SkillLapseSweepMachineInput, error: unknown): void {
  try {
    input.onError(error);
  } catch {
    // an onError that throws loses only its own report, and the next tick still sweeps
  }
}
