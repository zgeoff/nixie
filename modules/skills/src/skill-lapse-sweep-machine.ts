import type { Clock } from '@heynixie/clock';
import { assign, fromCallback, fromPromise, setup } from 'xstate';

export interface SkillLapseSweepMachineInput {
  readonly sweep: () => Promise<unknown>;

  readonly clock: Clock;

  readonly intervalMs: number;

  readonly onError: (error: unknown) => void;
}

interface SkillLapseSweepContext {
  readonly input: SkillLapseSweepMachineInput;

  readonly isStopping: boolean;
}

type SkillLapseSweepEvent = { readonly type: 'tick' } | { readonly type: 'stop' };

const skillLapseSweepActors = {
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
};

// xstate's `setup` takes its type parameters in this order: context, events, actors, children,
// actions, guards, delays, tags, then input.
export const skillLapseSweepMachine = setup<
  SkillLapseSweepContext,
  SkillLapseSweepEvent,
  typeof skillLapseSweepActors,
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  never,
  string,
  SkillLapseSweepMachineInput
>({ actors: skillLapseSweepActors }).createMachine({
  id: 'skillLapseSweep',
  context: (start) => ({ input: start.input, isStopping: false }),

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
        tick: {},
        stop: { actions: assign({ isStopping: true }) },
      },
    },
    stopped: { type: 'final' },
  },
});

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
  } catch {}
}
