import type {
  ExecExit,
  ExecResult,
  MemoryKillRead,
  ProcessIO,
  RunSpec,
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
  readonly spawned: readonly {
    readonly sandboxID: string;
    readonly argv: readonly string[];
    readonly env: Readonly<Record<string, string>>;
  }[];
  readonly countMostLive: () => number;

  // every exec a sandbox ran, in order
  readonly execs: readonly { readonly sandboxID: string; readonly command: RunSpec }[];

  // the files of each sandbox by guest path, which copyIn writes and copyOut reads
  readonly files: ReadonlyMap<string, Map<string, Uint8Array<ArrayBuffer>>>;
}

export interface StubExecContext {
  readonly sandboxID: string;
  readonly files: Map<string, Uint8Array<ArrayBuffer>>;
}

// answers one exec of a sandbox; without it, a sandbox runs no exec
export type StubExec = (
  command: RunSpec,
  ctx: StubExecContext,
  signal: AbortSignal | undefined,
) => Promise<ExecResult>;

type StubCallFailure =
  | { readonly kind: 'reject'; readonly message: string }
  | { readonly kind: 'hang' }
  | { readonly kind: 'wait'; readonly until: Promise<void> };

export interface StubSandboxAdapterOptions {
  readonly createFailures?: readonly StubCallFailure[];
  readonly listFailures?: readonly StubCallFailure[];
  readonly destroyFailures?: readonly StubCallFailure[];

  readonly readMemoryKills?: () => Promise<MemoryKillRead>;
  readonly exec?: StubExec;

  // a file that copyIn silently drops, so a copy of it comes back missing
  readonly skipCopyIn?: (path: string) => boolean;
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

  const spawned: {
    sandboxID: string;
    argv: readonly string[];
    env: Readonly<Record<string, string>>;
  }[] = [];

  const execs: { sandboxID: string; command: RunSpec }[] = [];

  const files = new Map<string, Map<string, Uint8Array<ArrayBuffer>>>();
  const live = new Map<string, Sandbox>();

  const mostLive = { count: 0 };

  return {
    id: 'stub',
    created,
    destroyed,
    spawned,
    execs,
    files,
    create: async (spec) => {
      await Promise.resolve();

      requireSandboxSpec(spec);

      await applyCallFailure(createFailures.shift());

      const id = crypto.randomUUID();

      const sandboxFiles = new Map<string, Uint8Array<ArrayBuffer>>();

      files.set(id, sandboxFiles);

      const sandbox = buildStubSandbox(id, spec, {
        guest,
        live,
        spawned,
        destroyed,
        destroyFailures,
        execs,
        files: sandboxFiles,
        exec: options.exec ?? null,
        skipCopyIn: options.skipCopyIn ?? (() => false),
        readMemoryKills:
          options.readMemoryKills ?? (() => Promise.resolve({ kind: 'unsupported' })),
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
  readonly spawned: {
    sandboxID: string;
    argv: readonly string[];
    env: Readonly<Record<string, string>>;
  }[];
  readonly destroyed: string[];
  readonly destroyFailures: StubCallFailure[];
  readonly execs: { sandboxID: string; command: RunSpec }[];
  readonly files: Map<string, Uint8Array<ArrayBuffer>>;
  readonly exec: StubExec | null;
  readonly skipCopyIn: (path: string) => boolean;
  readonly readMemoryKills: () => Promise<MemoryKillRead>;
}

function buildStubSandbox(id: string, spec: SandboxSpec, state: StubState): Sandbox {
  return {
    id,
    spec,
    exec: (command, signal) => {
      if (state.exec === null || !state.live.has(id)) {
        return Promise.reject(new Error(`the stub runs no exec in sandbox ${id}`));
      }

      state.execs.push({ sandboxID: id, command });

      return state.exec(command, { sandboxID: id, files: state.files }, signal);
    },
    spawn: (command: SpawnSpec) => {
      if (!state.live.has(id)) {
        return Promise.reject(new Error(`sandbox ${id} is destroyed`));
      }

      state.spawned.push({ sandboxID: id, argv: command.argv, env: command.env ?? {} });

      return Promise.resolve(startExecStream(startGuest(state.guest), command.maxMessageBytes));
    },
    copyIn: (specs) => {
      if (!state.live.has(id)) {
        return Promise.reject(new Error(`sandbox ${id} is destroyed`));
      }

      for (const file of specs) {
        if (!state.skipCopyIn(file.path)) {
          state.files.set(file.path, file.content);
        }
      }

      return Promise.resolve();
    },
    copyOut: (paths) => {
      if (!state.live.has(id)) {
        return Promise.reject(new Error(`sandbox ${id} is destroyed`));
      }

      return Promise.try(() =>
        paths.map((path) => {
          const content = state.files.get(path);

          if (content === undefined) {
            throw new Error(`the stub holds no file ${path}`);
          }

          return { path, content };
        }),
      );
    },
    resolveHome: (env) => {
      const home = env['HOME'] ?? '/home/stub';

      return Promise.resolve({ copyPath: home, ownPath: home });
    },
    readFilePaths: (directory) =>
      Promise.resolve(
        [...state.files.keys()]
          .filter((path) => path.startsWith(`${directory}/`))
          .map((path) => path.slice(directory.length + 1)),
      ),
    applyMove: () => Promise.reject(new Error('the stub runs no exec')),
    toolRoute: () => Promise.resolve(null),
    suspension: { kind: 'none' },
    readMemoryKills: state.readMemoryKills,
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
