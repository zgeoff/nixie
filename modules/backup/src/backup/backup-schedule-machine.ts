import type { Clock } from '@heynixie/clock';
import { assign, fromCallback, fromPromise, setup } from 'xstate';
import type { BackupPass } from './run-backup-pass';
import type { BackupStageOutcome, BackupStagePass } from './run-backup-stage-pass';

export interface BackupStageRequest {
  readonly settle: (outcome: BackupStageOutcome) => void;
  readonly reject: (error: unknown) => void;
}

export interface BackupScheduleMachineInput {
  readonly start: () => Promise<unknown>;
  readonly pass: () => Promise<BackupPass>;
  readonly stage: () => Promise<BackupStagePass>;
  readonly clock: Clock;
  readonly pollMs: number;
  readonly onPass: (pass: BackupPass) => void;
  readonly onError: (error: unknown) => void;
}

interface BackupScheduleContext {
  readonly input: BackupScheduleMachineInput;
  readonly isWakePending: boolean;
  readonly isStopping: boolean;
  readonly requests: readonly BackupStageRequest[];
}

type BackupScheduleEvent =
  | { readonly type: 'tick' }
  | { readonly type: 'wake' }
  | { readonly type: 'stage'; readonly request: BackupStageRequest }
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
  stage: fromPromise<BackupStagePass, BackupScheduleMachineInput>((staged) => staged.input.stage()),
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
  context: (start) => ({
    input: start.input,
    isWakePending: false,
    isStopping: false,
    requests: [],
  }),
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
        stage: {
          actions: assign({
            requests: (queued) => [...queued.context.requests, queued.event.request],
          }),
        },
        stop: { actions: assign({ isStopping: true }) },
      },
    },
    waiting: {
      on: {
        tick: { target: 'passing' },
        wake: { target: 'passing' },
        stage: {
          target: 'staging',
          actions: assign({
            requests: (queued) => [...queued.context.requests, queued.event.request],
          }),
        },
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

          // A queued request runs before a wake, so commits during a pass cannot postpone it.
          {
            guard: (passed) => passed.context.requests.length > 0,
            target: 'staging',
            actions: (passed) => {
              reportPass(passed.context.input, passed.event.output);
            },
          },
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
            guard: (failed) => failed.context.requests.length > 0,
            target: 'staging',
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
        stage: {
          actions: assign({
            requests: (queued) => [...queued.context.requests, queued.event.request],
          }),
        },
        stop: { actions: assign({ isStopping: true }) },
      },
    },
    staging: {
      invoke: {
        // oxlint-disable-next-line zgeoff/no-abbreviated-names -- xstate names the invoked actor `src`
        src: 'stage',
        input: (entered) => entered.context.input,
        onDone: [
          {
            guard: (staged) => staged.context.isStopping,
            target: 'stopped',
            actions: [
              (staged) => {
                settleRequest(staged.context, staged.event.output);
              },
              assign({ requests: (settled) => settled.context.requests.slice(1) }),
            ],
          },
          {
            guard: (staged) => staged.context.requests.length > 1,
            target: 'staging',
            reenter: true,
            actions: [
              (staged) => {
                settleRequest(staged.context, staged.event.output);
              },
              assign({ requests: (settled) => settled.context.requests.slice(1) }),
            ],
          },
          {
            guard: (staged) => staged.context.isWakePending,
            target: 'passing',
            actions: [
              (staged) => {
                settleRequest(staged.context, staged.event.output);
              },
              assign({ requests: (settled) => settled.context.requests.slice(1) }),
            ],
          },
          {
            target: 'waiting',
            actions: [
              (staged) => {
                settleRequest(staged.context, staged.event.output);
              },
              assign({ requests: (settled) => settled.context.requests.slice(1) }),
            ],
          },
        ],
        onError: [
          {
            guard: (failed) => failed.context.isStopping,
            target: 'stopped',
            actions: [
              (failed) => {
                failRequest(failed.context, failed.event.error);
              },
              assign({ requests: (settled) => settled.context.requests.slice(1) }),
            ],
          },
          {
            guard: (failed) => failed.context.requests.length > 1,
            target: 'staging',
            reenter: true,
            actions: [
              (failed) => {
                failRequest(failed.context, failed.event.error);
              },
              assign({ requests: (settled) => settled.context.requests.slice(1) }),
            ],
          },
          {
            guard: (failed) => failed.context.isWakePending,
            target: 'passing',
            actions: [
              (failed) => {
                failRequest(failed.context, failed.event.error);
              },
              assign({ requests: (settled) => settled.context.requests.slice(1) }),
            ],
          },
          {
            target: 'waiting',
            actions: [
              (failed) => {
                failRequest(failed.context, failed.event.error);
              },
              assign({ requests: (settled) => settled.context.requests.slice(1) }),
            ],
          },
        ],
      },
      on: {
        tick: {},
        wake: { actions: assign({ isWakePending: true }) },
        stage: {
          actions: assign({
            requests: (queued) => [...queued.context.requests, queued.event.request],
          }),
        },
        stop: { actions: assign({ isStopping: true }) },
      },
    },
    stopped: {
      type: 'final',
      entry: (stopped) => {
        for (const request of stopped.context.requests) {
          request.reject(new Error('the backup schedule stopped'));
        }
      },
    },
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

function settleRequest(context: BackupScheduleContext, pass: BackupStagePass): void {
  reportPass(context.input, pass.pass);
  context.requests[0]?.settle(pass.outcome);
}

function failRequest(context: BackupScheduleContext, error: unknown): void {
  reportFailure(context.input, error);
  context.requests[0]?.reject(error);
}
