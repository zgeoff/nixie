// oxlint-disable typescript/prefer-readonly-parameter-types -- streams and their writers have no readonly form
import type {
  ExecExit,
  ProcessIO,
  Sandbox,
  SandboxAdapter,
  SandboxSpec,
  SpawnSpec,
} from '@heynixie/sandbox';
import { requireSandboxSpec, startExecStream } from '@heynixie/sandbox';

// A program the stub runs for each spawn: it reads the process's stdin, writes its stdout, and
// returns its exit code. A guest that never returns runs until the caller stops it.
export type StubGuest = (
  stdin: ReadableStream<Uint8Array>,
  stdout: WritableStreamDefaultWriter<Uint8Array>,
) => Promise<number>;

export interface StubSandboxAdapter extends SandboxAdapter {
  readonly created: readonly { readonly id: string; readonly spec: SandboxSpec }[];
  readonly destroyed: readonly string[];
  readonly spawned: readonly { readonly sandboxID: string; readonly argv: readonly string[] }[];
}

// A sandbox adapter that runs each spawn as an in-process guest behind the real frame streams, and
// records each create, destroy and spawn. It refuses a spec and a spawn in a destroyed sandbox as a
// real adapter does.
export function buildStubSandboxAdapter(guest: StubGuest): StubSandboxAdapter {
  const created: { id: string; spec: SandboxSpec }[] = [];
  const destroyed: string[] = [];
  const spawned: { sandboxID: string; argv: readonly string[] }[] = [];
  const live = new Map<string, Sandbox>();
  const buildSandbox = (id: string, spec: SandboxSpec): Sandbox => ({
    id,
    spec,
    exec: () => Promise.reject(new Error('the stub runs no exec')),
    spawn: (command: SpawnSpec) => {
      if (!live.has(id)) {
        return Promise.reject(new Error(`sandbox ${id} is destroyed`));
      }
      spawned.push({ sandboxID: id, argv: command.argv });
      return Promise.resolve(startExecStream(startGuest(guest), command.maxMessageBytes));
    },
    copyIn: () => Promise.resolve(),
    copyOut: () => Promise.resolve([]),
    toolRoute: () => Promise.resolve(null),
    suspension: { kind: 'none' },
    destroy: () => {
      live.delete(id);
      destroyed.push(id);
      return Promise.resolve();
    },
  });

  return {
    id: 'stub',
    boundary: 'process',
    created,
    destroyed,
    spawned,
    create: async (spec) => {
      await Promise.resolve();
      requireSandboxSpec(spec);

      const id = crypto.randomUUID();
      const sandbox = buildSandbox(id, spec);

      live.set(id, sandbox);
      created.push({ id, spec });
      return sandbox;
    },
    get: (id) => Promise.resolve(live.get(id) ?? null),
    list: (owner) =>
      Promise.resolve([...live.values()].filter((sandbox) => sandbox.spec.owner === owner)),
  };
}

// runs the guest behind a ProcessIO, whose stop ends the process with SIGTERM
function startGuest(guest: StubGuest): ProcessIO {
  // a pipe buffers what the process has not read yet, so a write never waits for the guest
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

// the first exit wins, as a process exits once
async function stopProcess(process: GuestProcess, exit: ExecExit): Promise<void> {
  process.exit.resolve(exit);
  try {
    await process.stdout.close();
  } catch {
    // a stopped guest's output is closed already
  }
}
