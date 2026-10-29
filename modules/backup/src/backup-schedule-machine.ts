import type { Clock } from '@heynixie/clock';
import { assign, fromCallback, fromPromise, setup } from 'xstate';
import type { BackupPass } from './run-backup-pass';

export interface BackupScheduleMachineInput {
  readonly start: () => Promise<unknown>;
  readonly pass: () => Promise<BackupPass>;
  readonly clock: Clock;
  readonly pollMs: number;
  readonly onPass: (pass: BackupPass) => void;
  readonly onError: (error: unknown) => void;
}

interface BackupScheduleContext {
  readonly input: BackupScheduleMachineInput;
  readonly isWakePending: boolean;
  readonly isStopping: boolean;
}

type BackupScheduleEvent =
  | { readonly type: 'tick' }
  | { readonly type: 'wake' }
  | { readonly type: 'stop' };

const backupScheduleActors = {
  timer: fromCallback<BackupScheduleEvent, BackupScheduleMachineInput>((timer) => {
    const controller = new AbortController();

    void runTimer(timer.input, controller.signal, () => {
      timer.sendBack({ type: 'tick' });
    });

    return () => {
      controller.abort();
    };
  }),
  start: fromPromise<unknown, BackupScheduleMachineInput>((started) => started.input.start()),
  pass: fromPromise<BackupPass, BackupScheduleMachineInput>((passed) => passed.input.pass()),
};

// xstate's `setup` takes its type parameters in this order: context, events, actors, children,
// actions, guards, delays, tags, then input.
export const backupScheduleMachine = setup<
  BackupScheduleContext,
  BackupScheduleEvent,
  typeof backupScheduleActors,
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  never,
  string,
  BackupScheduleMachineInput
>({ actors: backupScheduleActors }).createMachine({
  id: 'backupSchedule',
  context: (start) => ({ input: start.input, isWakePending: false, isStopping: false }),
  invoke: {
    // oxlint-disable-next-line zgeoff/no-abbreviated-names -- xstate names the invoked actor `src`
    src: 'timer',
    input: (started) => started.context.input,
  },
  initial: 'starting',
  states: {
    starting: {
      invoke: {
        // oxlint-disable-next-line zgeoff/no-abbreviated-names -- xstate names the invoked actor `src`
        src: 'start',
        input: (entered) => entered.context.input,
        onDone: [
          { guard: (started) => started.context.isStopping, target: 'stopped' },
          { target: 'passing' },
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
            target: 'passing',
            actions: (failed) => {
              reportFailure(failed.context.input, failed.event.error);
            },
          },
        ],
      },
      on: {
        tick: {},
        wake: {},
        stop: { actions: assign({ isStopping: true }) },
      },
    },
    waiting: {
      on: {
        tick: { target: 'passing' },
        wake: { target: 'passing' },
        stop: { target: 'stopped' },
      },
    },
    passing: {
      entry: assign({ isWakePending: false }),
      invoke: {
        // oxlint-disable-next-line zgeoff/no-abbreviated-names -- xstate names the invoked actor `src`
        src: 'pass',
        input: (entered) => entered.context.input,
        onDone: [
          { guard: (passed) => passed.context.isStopping, target: 'stopped' },
          {
            guard: (passed) => passed.context.isWakePending,
            target: 'passing',
            reenter: true,
            actions: (passed) => {
              reportPass(passed.context.input, passed.event.output);
            },
          },
          {
            target: 'waiting',
            actions: (passed) => {
              reportPass(passed.context.input, passed.event.output);
            },
          },
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
        wake: { actions: assign({ isWakePending: true }) },
        stop: { actions: assign({ isStopping: true }) },
      },
    },
    stopped: { type: 'final' },
  },
});

async function runTimer(
  input: BackupScheduleMachineInput,
  signal: AbortSignal,
  onTick: () => void,
): Promise<void> {
  while (!signal.aborted) {
    await input.clock.sleep(input.pollMs, signal);

    if (!signal.aborted) {
      onTick();
    }
  }
}

function reportFailure(input: BackupScheduleMachineInput, error: unknown): void {
  try {
    input.onError(error);
  } catch {}
}

function reportPass(input: BackupScheduleMachineInput, pass: BackupPass): void {
  try {
    input.onPass(pass);
  } catch (error) {
    reportFailure(input, error);
  }
}
