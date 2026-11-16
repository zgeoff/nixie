import { assign, fromPromise, setup } from 'xstate';
import type { SourceHealth } from '../types';

export interface ScheduleSourceMachineInput {
  readonly runTick: () => Promise<void>;

  // sleeps until the next tick; resolves early when the signal aborts
  readonly sleep: (signal: AbortSignal) => Promise<void>;
  readonly reportHealth: (health: SourceHealth) => void;

  // aborted at stop
  readonly signal: AbortSignal;
}

interface ScheduleSourceContext {
  readonly input: ScheduleSourceMachineInput;
  readonly failedTicks: number;
  readonly isStopping: boolean;
}

interface ScheduleSourceEvent {
  readonly type: 'stop';
}

// The number of failed ticks in a row at which the source reports unhealthy.
const unhealthyAfterTicks = 3;

const scheduleSourceActors = {
  tick: fromPromise<void, ScheduleSourceMachineInput>((tick) => tick.input.runTick()),
  sleep: fromPromise<void, ScheduleSourceMachineInput>((sleep) =>
    sleep.input.sleep(AbortSignal.any([sleep.signal, sleep.input.signal])),
  ),
};

// xstate's `setup` takes its type parameters in this order: context, events, actors, children,
// actions, guards, delays, tags, then input.
export const scheduleSourceMachine = setup<
  ScheduleSourceContext,
  ScheduleSourceEvent,
  typeof scheduleSourceActors,
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  never,
  string,
  ScheduleSourceMachineInput
>({ actors: scheduleSourceActors }).createMachine({
  id: 'scheduleSource',
  context: (start) => ({ input: start.input, failedTicks: 0, isStopping: false }),
  initial: 'ticking',
  states: {
    ticking: {
      invoke: {
        // oxlint-disable-next-line zgeoff/no-abbreviated-names -- xstate names the invoked actor `src`
        src: 'tick',
        input: (entered) => entered.context.input,
        onDone: [
          { guard: (ticked) => ticked.context.isStopping, target: 'stopped' },
          {
            target: 'waiting',
            actions: [
              assign({ failedTicks: 0 }),
              (ticked) => {
                ticked.context.input.reportHealth('running');
              },
            ],
          },
        ],
        onError: [
          { guard: (failed) => failed.context.isStopping, target: 'stopped' },
          {
            target: 'waiting',
            actions: [
              assign({ failedTicks: (failed) => failed.context.failedTicks + 1 }),
              (failed) => {
                if (failed.context.failedTicks >= unhealthyAfterTicks) {
                  failed.context.input.reportHealth('unhealthy');
                }
              },
            ],
          },
        ],
      },
      on: {
        stop: { actions: assign({ isStopping: true }) },
      },
    },
    waiting: {
      invoke: {
        // oxlint-disable-next-line zgeoff/no-abbreviated-names -- xstate names the invoked actor `src`
        src: 'sleep',
        input: (entered) => entered.context.input,
        onDone: [
          { guard: (slept) => slept.context.input.signal.aborted, target: 'stopped' },
          { target: 'ticking' },
        ],
      },
      on: {
        stop: { target: 'stopped' },
      },
    },
    stopped: {
      type: 'final',
      entry: (stopped) => {
        stopped.context.input.reportHealth('stopped');
      },
    },
  },
});
