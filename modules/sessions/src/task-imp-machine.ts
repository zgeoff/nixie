import type { Sandbox } from '@heynixie/sandbox';
import type { RunEndpoint } from '@heynixie/tools';
import { machineTypes } from '@zgeoff/std';
import { assign, fromPromise, setup } from 'xstate';

export interface TaskImpParts {
  readonly startEndpoint: () => Promise<RunEndpoint>;

  // The adapter answers null for a sandbox whose imp is gone.
  readonly readSandbox: (id: string) => Promise<Sandbox | null>;

  // A kept sandbox may sleep from an earlier process.
  readonly createSandbox: () => Promise<{ readonly sandbox: Sandbox; readonly isKept: boolean }>;

  readonly removeSandboxes: () => Promise<number>;

  readonly onSleepFailed: (error: unknown) => void;
}

export interface TaskImp {
  readonly endpoint: RunEndpoint;
  readonly sandbox: Sandbox;
}

interface Reply<T> {
  readonly resolve: (value: T) => void;
  readonly reject: (error: unknown) => void;
}

type TaskImpEvent =
  | { readonly type: 'acquire'; readonly reply: Reply<TaskImp> }
  | { readonly type: 'release'; readonly reply: Reply<void> }
  | { readonly type: 'remove'; readonly reply: Reply<number> };

interface TaskImpContext {
  readonly parts: TaskImpParts;
  readonly endpoint: RunEndpoint | null;
  readonly sandbox: Sandbox | null;
  readonly isAsleep: boolean;

  readonly acquired: Reply<TaskImp> | null;
  readonly released: Reply<void> | null;
  readonly removed: Reply<number> | null;
}

interface PrepareInput {
  readonly parts: TaskImpParts;
  readonly sandbox: Sandbox | null;
  readonly isAsleep: boolean;
}

export const taskImpMachine = setup({
  types: machineTypes<{ input: TaskImpParts; context: TaskImpContext; events: TaskImpEvent }>(),
  actors: {
    startEndpoint: fromPromise<RunEndpoint, TaskImpParts>((started) =>
      started.input.startEndpoint(),
    ),
    prepare: fromPromise<Sandbox, PrepareInput>((prepared) => prepareSandbox(prepared.input)),
    sleep: fromPromise<void, Sandbox | null>(async (slept) => {
      if (slept.input?.suspension.kind === 'memory') {
        await slept.input.suspension.sleep();
      }
    }),
    remove: fromPromise<number, TaskImpContext>(async (removed) => {
      const count = await removed.input.parts.removeSandboxes();

      await removed.input.endpoint?.stop();

      return count;
    }),
  },
}).createMachine({
  id: 'taskImp',
  context: (start) => ({
    parts: start.input,
    endpoint: null,
    sandbox: null,
    isAsleep: false,
    acquired: null,
    released: null,
    removed: null,
  }),
  initial: 'idle',

  // A task runs one step at a time, so only the sweep can meet a change in flight, and it retries.
  on: {
    acquire: { actions: (busy) => busy.event.reply.reject(buildBusyError()) },
    release: { actions: (busy) => busy.event.reply.reject(buildBusyError()) },
    remove: { actions: (busy) => busy.event.reply.reject(buildBusyError()) },
  },
  states: {
    idle: {
      on: {
        acquire: [
          {
            guard: (asked) => asked.context.endpoint !== null,
            target: 'preparing',
            actions: assign((asked) => ({ acquired: asked.event.reply })),
          },
          {
            target: 'startingEndpoint',
            actions: assign((asked) => ({ acquired: asked.event.reply })),
          },
        ],
        remove: {
          target: 'removing',
          actions: assign((asked) => ({ removed: asked.event.reply })),
        },
      },
    },
    startingEndpoint: {
      invoke: {
        // oxlint-disable-next-line zgeoff/no-abbreviated-names -- xstate names the invoked actor `src`
        src: 'startEndpoint',
        input: (entered) => entered.context.parts,
        onDone: {
          target: 'preparing',
          actions: assign((done) => ({ endpoint: done.event.output })),
        },
        onError: {
          target: 'idle',
          actions: [
            (failed) => failed.context.acquired?.reject(failed.event.error),
            assign({ acquired: null }),
          ],
        },
      },
    },
    preparing: {
      invoke: {
        // oxlint-disable-next-line zgeoff/no-abbreviated-names -- xstate names the invoked actor `src`
        src: 'prepare',
        input: (entered) => ({
          parts: entered.context.parts,
          sandbox: entered.context.sandbox,
          isAsleep: entered.context.isAsleep,
        }),
        onDone: {
          target: 'awake',
          actions: [
            assign((done) => ({ sandbox: done.event.output, isAsleep: false })),
            (done) => resolveAcquired(done.context),
            assign({ acquired: null }),
          ],
        },
        onError: {
          target: 'idle',
          actions: [
            (failed) => failed.context.acquired?.reject(failed.event.error),
            assign({ sandbox: null, isAsleep: false, acquired: null }),
          ],
        },
      },
    },
    awake: {
      on: {
        acquire: {
          target: 'preparing',
          actions: assign((asked) => ({ acquired: asked.event.reply })),
        },
        release: {
          target: 'sleeping',
          actions: assign((asked) => ({ released: asked.event.reply })),
        },
        remove: {
          target: 'removing',
          actions: assign((asked) => ({ removed: asked.event.reply })),
        },
      },
    },

    // A failed sleep leaves the imp awake and the step's work standing: it costs only host memory.
    sleeping: {
      invoke: {
        // oxlint-disable-next-line zgeoff/no-abbreviated-names -- xstate names the invoked actor `src`
        src: 'sleep',
        input: (entered) => entered.context.sandbox,
        onDone: {
          target: 'asleep',
          actions: [
            assign((done) => ({ isAsleep: done.context.sandbox?.suspension.kind === 'memory' })),
            (done) => done.context.released?.resolve(),
            assign({ released: null }),
          ],
        },
        onError: {
          target: 'awake',
          actions: [
            (failed) => failed.context.parts.onSleepFailed(failed.event.error),
            (failed) => failed.context.released?.resolve(),
            assign({ released: null }),
          ],
        },
      },
    },
    asleep: {
      on: {
        acquire: {
          target: 'preparing',
          actions: assign((asked) => ({ acquired: asked.event.reply })),
        },
        remove: {
          target: 'removing',
          actions: assign((asked) => ({ removed: asked.event.reply })),
        },
      },
    },
    removing: {
      invoke: {
        // oxlint-disable-next-line zgeoff/no-abbreviated-names -- xstate names the invoked actor `src`
        src: 'remove',
        input: (entered) => entered.context,
        onDone: {
          target: 'gone',
          actions: (done) => done.context.removed?.resolve(done.event.output),
        },
        onError: {
          target: 'idle',
          actions: [
            (failed) => failed.context.removed?.reject(failed.event.error),
            assign({ sandbox: null, isAsleep: false, removed: null }),
          ],
        },
      },
    },
    gone: { type: 'final' },
  },
});

async function prepareSandbox(input: PrepareInput): Promise<Sandbox> {
  const current = input.sandbox === null ? null : await input.parts.readSandbox(input.sandbox.id);

  const held =
    current === null
      ? await input.parts.createSandbox()
      : { sandbox: current, isKept: input.isAsleep };

  // Waking an awake sandbox costs nothing, so a kept one that may sleep is woken too.
  if (held.isKept && held.sandbox.suspension.kind === 'memory') {
    await held.sandbox.suspension.wake();
  }

  return held.sandbox;
}

function buildBusyError(): Error {
  return new Error("the task's imp is busy with another change");
}

function resolveAcquired(context: TaskImpContext): void {
  if (context.endpoint !== null && context.sandbox !== null) {
    context.acquired?.resolve({ endpoint: context.endpoint, sandbox: context.sandbox });
  }
}
