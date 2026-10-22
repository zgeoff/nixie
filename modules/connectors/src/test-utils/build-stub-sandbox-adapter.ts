import type {
  ExecExit,
  ProcessIO,
  Sandbox,
  SandboxAdapter,
  SandboxSpec,
  SpawnSpec,
} from '@heynixie/sandbox';
import { requireSandboxSpec, startExecStream } from '@heynixie/sandbox';

export type StubGuest = (
  stdin: ReadableStream<Uint8Array>,
  stdout: WritableStreamDefaultWriter<Uint8Array>,
) => Promise<number>;

export interface StubSandboxAdapter extends SandboxAdapter {
  readonly created: readonly { readonly id: string; readonly spec: SandboxSpec }[];
  readonly destroyed: readonly string[];
  readonly spawned: readonly { readonly sandboxID: string; readonly argv: readonly string[] }[];
  readonly countMostLive: () => number;
}

type StubCallFailure =
  | { readonly kind: 'reject'; readonly message: string }
  | { readonly kind: 'hang' }
  | { readonly kind: 'wait'; readonly until: Promise<void> };

export interface StubSandboxAdapterOptions {
  readonly createFailures?: readonly StubCallFailure[];
  readonly listFailures?: readonly StubCallFailure[];
  readonly destroyFailures?: readonly StubCallFailure[];
}

export function buildStubSandboxAdapter(
  guest: StubGuest,
  options: StubSandboxAdapterOptions = {},
): StubSandboxAdapter {
  const createFailures = [...(options.createFailures ?? [])];
  const listFailures = [...(options.listFailures ?? [])];
  const destroyFailures = [...(options.destroyFailures ?? [])];
  const created: { id: string; spec: SandboxSpec }[] = [];
  const destroyed: string[] = [];
  const spawned: { sandboxID: string; argv: readonly string[] }[] = [];

  const live = new Map<string, Sandbox>();

  const mostLive = { count: 0 };

  return {
    id: 'stub',
    boundary: 'process',
    created,
    destroyed,
    spawned,
    create: async (spec) => {
      await Promise.resolve();

      requireSandboxSpec(spec);

      await applyCallFailure(createFailures.shift());

      const id = crypto.randomUUID();

      const sandbox = buildStubSandbox(id, spec, {
        guest,
        live,
        spawned,
        destroyed,
        destroyFailures,
      });

      live.set(id, sandbox);
      created.push({ id, spec });

      mostLive.count = Math.max(mostLive.count, live.size);

      return sandbox;
    },
    read: (id) => Promise.resolve(live.get(id) ?? null),
    list: async (owner) => {
      await applyCallFailure(listFailures.shift());

      return [...live.values()].filter((sandbox) => sandbox.spec.owner === owner);
    },
    addSecret: () => Promise.resolve(),
    addImage: () => Promise.resolve(),
    checkRuntime: () => Promise.resolve({ isReady: true, reason: null }),
    countMostLive: () => mostLive.count,
  };
}

async function applyCallFailure(failure: StubCallFailure | undefined): Promise<void> {
  if (failure?.kind === 'reject') {
    throw new Error(failure.message);
  }

  if (failure?.kind === 'hang') {
    await Promise.withResolvers<never>().promise;
  }

  if (failure?.kind === 'wait') {
    await failure.until;
  }
}

interface StubState {
  readonly guest: StubGuest;
  readonly live: Map<string, Sandbox>;
  readonly spawned: { sandboxID: string; argv: readonly string[] }[];
  readonly destroyed: string[];
  readonly destroyFailures: StubCallFailure[];
}

function buildStubSandbox(id: string, spec: SandboxSpec, state: StubState): Sandbox {
  return {
    id,
    spec,
    exec: () => Promise.reject(new Error('the stub runs no exec')),
    spawn: (command: SpawnSpec) => {
      if (!state.live.has(id)) {
        return Promise.reject(new Error(`sandbox ${id} is destroyed`));
      }

      state.spawned.push({ sandboxID: id, argv: command.argv });

      return Promise.resolve(startExecStream(startGuest(state.guest), command.maxMessageBytes));
    },
    copyIn: () => Promise.resolve(),
    copyOut: () => Promise.resolve([]),
    resolveHome: () => Promise.reject(new Error('the stub runs no exec')),
    readFilePaths: () => Promise.reject(new Error('the stub runs no exec')),
    applyMove: () => Promise.reject(new Error('the stub runs no exec')),
    toolRoute: () => Promise.resolve(null),
    suspension: { kind: 'none' },
    isRetired: false,
    destroy: async () => {
      await applyCallFailure(state.destroyFailures.shift());

      state.live.delete(id);
      state.destroyed.push(id);
    },
  };
}

function startGuest(guest: StubGuest): ProcessIO {
  const stdin = new TransformStream<Uint8Array, Uint8Array>(
    {},
    { highWaterMark: Number.POSITIVE_INFINITY },
    { highWaterMark: Number.POSITIVE_INFINITY },
  );

  const stdout = new TransformStream<Uint8Array, Uint8Array>();

  const stdinWriter = stdin.writable.getWriter();
  const exit = Promise.withResolvers<ExecExit>();
  const process = { stdout: stdout.writable.getWriter(), exit };

  void runGuest(guest, stdin.readable, process);

  return {
    stdout: stdout.readable,
    stderr: new Blob([]).stream(),
    write: (bytes) => stdinWriter.write(bytes),
    closeStdin: () => stdinWriter.close(),
    exit: exit.promise,
    stop: () => {
      void stopProcess(process, { code: null, signal: 'SIGTERM' });
    },
  };
}

interface GuestProcess {
  readonly stdout: WritableStreamDefaultWriter<Uint8Array>;
  readonly exit: PromiseWithResolvers<ExecExit>;
}

async function runGuest(
  guest: StubGuest,
  stdin: ReadableStream<Uint8Array>,
  process: GuestProcess,
): Promise<void> {
  try {
    const code = await guest(stdin, process.stdout);

    await stopProcess(process, { code, signal: null });
  } catch {
    await stopProcess(process, { code: 1, signal: null });
  }
}

async function stopProcess(process: GuestProcess, exit: ExecExit): Promise<void> {
  process.exit.resolve(exit);

  try {
    await process.stdout.close();
  } catch {}
}
