import { onTestFinished } from 'bun:test';
import { createServer } from 'node:net';
import { waitForSettled } from '@heynixie/async';
import { memoryKillsArgv } from '../memory-kills-argv';
import type { ImpCreateInput, ImpExec, ImpExecOptions, ImpFeatures, ImpPort } from '../types';
import type { FakeSleeps } from './build-fake-sleeps';
import { buildFakeSleeps } from './build-fake-sleeps';
import { createPendingExec } from './create-pending-exec';
import { startFakeForward } from './start-fake-forward';

interface FakeExec {
  readonly argv: readonly string[];

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

  readonly images: Map<string, { readonly digest: string; readonly ref: string }>;
  features: ImpFeatures;
  failFeatures: boolean;
  failCreate: boolean;
  failRemove: boolean;
  failExitOnStop: boolean;

  refuseImageAdd: boolean;
}

interface FakeImpMemory {
  // A count the guest's memory.events holds, no such file, or a connection that drops mid-read.
  memoryKills: number | 'missing' | 'lost';
}

interface FakeImp
  extends FakeState, FakeImpMemory, Pick<FakeSleeps, 'startIdleSleep' | 'sleepsAfterWake'> {
  readonly port: ImpPort;
}

export async function startFakeImp(): Promise<FakeImp> {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const state: FakeState & FakeImpMemory = {
    guestToolPort: await readFreePort(),
    calls: [],
    created: [],
    execs: [],
    secrets: new Map(),
    images: new Map(),
    features: { publicEgress: true, isEgressEnforced: true, hasBackupOptOut: true },
    failFeatures: false,
    failCreate: false,
    failRemove: false,
    failExitOnStop: false,
    refuseImageAdd: false,
    memoryKills: 0,
  };

  const sleeps = buildFakeSleeps(state.calls);

  return Object.assign(state, {
    port: buildFakePort(state, sleeps, stack),
    startIdleSleep: sleeps.startIdleSleep,
    sleepsAfterWake: sleeps.sleepsAfterWake,
  });
}

async function readFreePort(): Promise<number> {
  const server = createServer();
  const listening = Promise.withResolvers<void>();

  server.listen(0, '127.0.0.1', listening.resolve);

  await listening.promise;

  const address = server.address();

  server.close();

  return typeof address === 'object' && address !== null ? address.port : 0;
}

function buildFakePort(
  state: FakeState & FakeImpMemory,
  sleeps: FakeSleeps,
  stack: AsyncDisposableStack,
): ImpPort {
  const updateCallLog = (call: string): Promise<void> => {
    state.calls.push(call);

    return Promise.resolve();
  };

  return {
    readFeatures: () =>
      state.failFeatures
        ? Promise.reject(new Error('connect ECONNREFUSED'))
        : Promise.resolve(state.features),
    ...buildFakeImageCalls(state, updateCallLog),
    createImp: async (input) => {
      await updateCallLog(`create ${input.name}`);

      if (state.failCreate) {
        throw new Error('RAM_BUDGET_EXCEEDED');
      }

      state.created.push(input);
    },

    readImpBackup: (name) =>
      Promise.resolve(state.created.findLast((input) => input.name === name)?.backup ?? null),
    removeImp: async (name) => {
      await updateCallLog(`remove ${name}`);

      if (state.failRemove) {
        throw new Error('INTERNAL_SERVER_ERROR');
      }
    },
    sleepImp: (name) => updateCallLog(`sleep ${name}`),
    wakeImp: async (name) => {
      await sleeps.waitForAwake(name, 'wake');

      await updateCallLog(`wake ${name}`);

      sleeps.startSleepAfterWake(name);
    },
    ...buildFakeSecretCalls(state, updateCallLog),

    openExec: (name, argv, options) => {
      if (isSameArgv(argv, memoryKillsArgv)) {
        state.calls.push(`memory-kills ${name}`);

        return Promise.resolve(
          createPendingExec(sleeps.waitForAwake(name, 'exec'), () =>
            startFakeMemoryKillsExec(state.memoryKills),
          ),
        );
      }

      const exec: FakeExec = { argv, options, signals: [], failsOnStop: state.failExitOnStop };

      state.execs.push(exec);

      return Promise.resolve(
        createPendingExec(sleeps.waitForAwake(name, 'exec'), () => startFakeExec(exec, stack)),
      );
    },
    ...buildFakeForwardCall(state, sleeps),
  };
}

type FakeImageCalls = Pick<ImpPort, 'listImages' | 'addImage'>;

type UpdateCallLog = (call: string) => Promise<void>;

function buildFakeImageCalls(state: FakeState, updateCallLog: UpdateCallLog): FakeImageCalls {
  return {
    listImages: () =>
      Promise.resolve(
        [...state.images].map(([name, held]) => ({ name, digest: held.digest, ref: held.ref })),
      ),
    addImage: async (image) => {
      await updateCallLog(`image ${image.name} ${image.ref}`);

      if (state.refuseImageAdd) {
        throw new Error('token nixie-test is limited to some imps; this call is host-wide');
      }

      state.images.set(image.name, { digest: image.digest, ref: image.ref });
    },
  };
}

type FakeSecretCalls = Pick<ImpPort, 'readSecretHosts' | 'addGrant' | 'addSecret'>;

function buildFakeSecretCalls(state: FakeState, updateCallLog: UpdateCallLog): FakeSecretCalls {
  return {
    readSecretHosts: (secret) => Promise.resolve(state.secrets.get(secret) ?? null),
    addGrant: (name, secret) => updateCallLog(`grant ${name} ${secret}`),
    addSecret: async (secret) => {
      await updateCallLog(`secret ${secret.name} ${secret.host} ${secret.header} ${secret.scheme}`);

      state.secrets.set(secret.name, [secret.host]);
    },
  };
}

function isSameArgv(argv: readonly string[], expected: readonly string[]): boolean {
  return argv.length === expected.length && argv.every((arg, index) => arg === expected[index]);
}

function startFakeMemoryKillsExec(memoryKills: FakeImpMemory['memoryKills']): ImpExec {
  const encoder = new TextEncoder();

  const events =
    typeof memoryKills === 'number'
      ? `low 0\nhigh 0\nmax ${memoryKills}\noom ${memoryKills}\noom_kill ${memoryKills}\noom_group_kill 0\n`
      : '';

  const exit = Promise.withResolvers<{ code: number | null; signal: string | null }>();

  if (memoryKills === 'lost') {
    exit.reject(new Error('CONNECTION_CLOSED'));
  } else {
    exit.resolve({ code: 0, signal: null });
  }

  void waitForSettled(exit.promise);

  return {
    started: Promise.resolve(),
    stdout: new Blob([encoder.encode(events)]).stream(),
    stderr: new Blob([]).stream(),
    write: () => Promise.resolve(),
    closeStdin: () => Promise.resolve(),
    sendSignal: () => {},
    close: () => {},
    exit: exit.promise,
  };
}

const brokerEnv: Readonly<Record<string, string>> = {
  HTTPS_PROXY: 'http://broker.invalid:3128',
  https_proxy: 'http://broker.invalid:3128',
  NO_PROXY: 'localhost,127.0.0.1,::1',
  no_proxy: 'localhost,127.0.0.1,::1',
};

function startFakeExec(exec: FakeExec, stack: AsyncDisposableStack): ImpExec {
  requireBrokerEnv(exec.options);

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
    started: Promise.resolve(),
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

      stopProcessGroup(child.pid, exec.options.killGraceMs, stack);
    },
    close: () => {
      sendGroupSignal(child.pid, 'SIGKILL');
    },
    exit: Promise.race([
      waitForExit(child.exited, () => ({
        code: child.signalCode === null ? child.exitCode : null,
        signal: child.signalCode === null ? null : String(child.signalCode),
      })),
      lost.promise,
    ]),
  };
}

function requireBrokerEnv(options: ImpExecOptions): void {
  const env = options.env;

  const replaced = Object.keys(brokerEnv).find(
    (key) => env[key] !== undefined && env[key] !== brokerEnv[key],
  );

  if (options.requireBroker && replaced !== undefined) {
    throw new Error(
      `the broker is not ready for this exec: the exec's env sets ${replaced}, which the broker sets`,
    );
  }
}

function sendGroupSignal(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {}
}

// The SIGKILL timer must not outlive the fake, because the kernel can reuse the PID for a later
// test's process group.
function stopProcessGroup(pid: number, graceMs: number, stack: AsyncDisposableStack): void {
  sendGroupSignal(pid, 'SIGTERM');

  const kill = setTimeout(sendGroupSignal, graceMs, pid, 'SIGKILL');

  stack.defer(() => {
    clearTimeout(kill);
  });
}

async function waitForExit<T>(exited: Promise<number>, readExit: () => T): Promise<T> {
  await exited;

  return readExit();
}

type ForwardPort = Pick<ImpPort, 'openReverseForward'>;

function buildFakeForwardCall(state: FakeState, sleeps: FakeSleeps): ForwardPort {
  return {
    openReverseForward: (name, guestPort, onConnection) => {
      state.calls.push(`forward ${name} ${guestPort}`);

      const forward = startFakeForward({
        port: state.guestToolPort,
        onConnection,
        onStop: () => {
          state.calls.push(`forward-stopped ${name}`);
        },
        waitForAwake: () => sleeps.waitForAwake(name, 'listen'),
      });

      sleeps.registerForward(name, forward);

      return forward;
    },
  };
}
