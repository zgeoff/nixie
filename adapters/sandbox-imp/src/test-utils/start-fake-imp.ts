import { onTestFinished } from 'bun:test';
import { once } from 'node:events';
import { createServer } from 'node:net';
import type {
  ImpCreateInput,
  ImpExec,
  ImpExecOptions,
  ImpFeatures,
  ImpForward,
  ImpPort,
} from '../types';

interface FakeExec {
  readonly argv: readonly string[];

  // impd ends the session without an exit after a stop, as a lost connection does
  readonly failsOnStop: boolean;
  readonly options: ImpExecOptions;
  readonly signals: string[];
}

interface FakeState {
  readonly guestToolPort: number;
  readonly calls: string[];
  readonly created: ImpCreateInput[];
  readonly execs: FakeExec[];
  readonly secrets: Map<string, readonly string[]>;
  features: ImpFeatures;
  failCreate: boolean;
  failExitOnStop: boolean;
}

export interface FakeImp extends FakeState {
  readonly port: ImpPort;
}

// Stands in for impd, logging every call in order. Each exec runs as a local process group with
// the imp's environment, and the guest kills the group killGraceMs after a SIGTERM. A reverse
// forward listens on a free local port, which a local guest reaches as the imp's loopback port.
export async function startFakeImp(): Promise<FakeImp> {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const state: FakeState = {
    guestToolPort: await findFreePort(),
    calls: [],
    created: [],
    execs: [],
    secrets: new Map([['model-default', ['api.anthropic.com']]]),
    features: { publicEgress: true, isEgressEnforced: true },
    failCreate: false,
    failExitOnStop: false,
  };

  return Object.assign(state, { port: buildFakePort(state, stack) });
}

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- the fake's own log and cleanup
function buildFakePort(state: FakeState, stack: AsyncDisposableStack): ImpPort {
  const updateCallLog = (call: string): Promise<void> => {
    state.calls.push(call);
    return Promise.resolve();
  };

  return {
    readFeatures: () => Promise.resolve(state.features),
    createImp: async (input) => {
      await updateCallLog(`create ${input.name}`);
      if (state.failCreate) {
        throw new Error('RAM_BUDGET_EXCEEDED');
      }
      state.created.push(input);
    },
    removeImp: (name) => updateCallLog(`remove ${name}`),
    sleepImp: (name) => updateCallLog(`sleep ${name}`),
    wakeImp: (name) => updateCallLog(`wake ${name}`),
    readSecretHosts: (secret) => Promise.resolve(state.secrets.get(secret) ?? null),
    addGrant: (name, secret) => updateCallLog(`grant ${name} ${secret}`),
    openExec: (_name, argv, options) => {
      const exec: FakeExec = { argv, options, signals: [], failsOnStop: state.failExitOnStop };

      state.execs.push(exec);
      if (options.requireBroker) {
        requireBrokerEnv(options.env);
      }
      return Promise.resolve(startFakeExec(exec, stack));
    },
    openReverseForward: (name, guestPort, onConnection) => {
      state.calls.push(`forward ${name} ${guestPort}`);
      return startFakeForward(
        {
          port: state.guestToolPort,
          onConnection,
          onStop: () => {
            state.calls.push(`forward-stopped ${name}`);
          },
        },
        stack,
      );
    },
  };
}

// the variables impd 0.40 sets for an exec in an imp with a grant, the placeholders of a preset kind
// left out
const brokerEnv: Readonly<Record<string, string>> = {
  HTTPS_PROXY: 'http://broker.invalid:3128',
  https_proxy: 'http://broker.invalid:3128',
  NO_PROXY: 'localhost,127.0.0.1,::1',
  no_proxy: 'localhost,127.0.0.1,::1',
};

// An exec that requires the broker gets these, and impd refuses one whose env replaces any.
function requireBrokerEnv(env: Readonly<Record<string, string>>): void {
  const replaced = Object.keys(brokerEnv).find(
    (key) => env[key] !== undefined && env[key] !== brokerEnv[key],
  );

  if (replaced !== undefined) {
    throw new Error(
      `the broker is not ready for this exec: the exec's env sets ${replaced}, which the broker sets`,
    );
  }
}

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- the fake's own exec log and cleanup
function startFakeExec(exec: FakeExec, stack: AsyncDisposableStack): ImpExec {
  const child = Bun.spawn([...exec.argv], {
    env: {
      PATH: process.env['PATH'] ?? '/usr/bin:/bin',
      ...(exec.options.requireBroker ? brokerEnv : {}),
      ...exec.options.env,
    },
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    detached: true,
  });

  const lost = Promise.withResolvers<never>();

  stack.defer(() => {
    sendGroupSignal(child.pid, 'SIGKILL');
  });
  return {
    stdout: child.stdout,
    stderr: child.stderr,
    write: async (data) => {
      await child.stdin.write(data);
      await child.stdin.flush();
    },
    closeStdin: async () => {
      await child.stdin.end();
    },
    sendSignal: (signal) => {
      exec.signals.push(signal);
      if (exec.failsOnStop) {
        lost.reject(new Error('CONNECTION_CLOSED'));
      }
      sendGroupSignal(child.pid, 'SIGTERM');
      setTimeout(sendGroupSignal, exec.options.killGraceMs, child.pid, 'SIGKILL');
    },
    close: () => {
      sendGroupSignal(child.pid, 'SIGKILL');
    },
    exit: Promise.race([
      waitForExit(child.exited, () => ({
        code: child.signalCode === null ? child.exitCode : null,
        signal: child.signalCode,
      })),
      lost.promise,
    ]),
  };
}

async function waitForExit<T>(exited: Promise<number>, readExit: () => T): Promise<T> {
  await exited;
  return readExit();
}

interface FakeForwardOptions {
  readonly port: number;
  readonly onConnection: Parameters<ImpPort['openReverseForward']>[2];
  readonly onStop: () => void;
}

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- the fake's own cleanup
function startFakeForward(options: FakeForwardOptions, stack: AsyncDisposableStack): ImpForward {
  const ended = Promise.withResolvers<{ readonly kind: string }>();
  const listening = Promise.withResolvers<unknown>();
  const server = createServer((socket) => {
    options.onConnection((handlers) => {
      socket.on('data', (chunk: Uint8Array) => void handlers.onData(chunk));
      socket.once('end', handlers.onEof);
      socket.once('close', () => {
        handlers.onClose(false);
      });
      return {
        send: (data) => socket.write(data),
        waitForRoom: async () => {
          await once(socket, 'drain');
        },
        sendEof: () => {
          socket.end();
        },
        close: () => {
          socket.destroy();
        },
      };
    });
  });

  server.once('error', listening.reject);
  server.listen(options.port, '127.0.0.1', () => {
    listening.resolve(options.port);
  });
  stack.defer(() => {
    server.close();
  });
  return {
    listening: listening.promise,
    ended: ended.promise,
    stop: () => {
      options.onStop();
      server.close();
      ended.resolve({ kind: 'stopped' });
    },
  };
}

async function findFreePort(): Promise<number> {
  const server = createServer();
  const listening = Promise.withResolvers<void>();

  server.listen(0, '127.0.0.1', listening.resolve);
  await listening.promise;

  const address = server.address();

  server.close();
  return typeof address === 'object' && address !== null ? address.port : 0;
}

function sendGroupSignal(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    // the group is gone already
  }
}
