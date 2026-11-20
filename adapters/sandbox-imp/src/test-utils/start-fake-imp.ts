import { onTestFinished } from 'bun:test';
import type { Socket } from 'node:net';
import { createServer } from 'node:net';
import { waitForSettled } from '@heynixie/async';
import type { TestGuest } from '@impz/testing';
import { TEST_TOKEN } from '@impz/testing';
import invariant from 'tiny-invariant';
import { memoryKillsArgv } from '../memory/memory-kills-argv';
import { buildImpPort } from '../sandbox/build-imp-port';
import type { ImpExec, ImpExecOptions, ImpPort } from '../types';
import { attachTestGuests } from './attach-test-guests';
import type { FakeSleeps } from './build-fake-sleeps';
import { buildFakeSleeps } from './build-fake-sleeps';
import { createPendingExec } from './create-pending-exec';
import type { SharedImpdTest } from './start-impd';

// @impz/testing runs no command and pulls no image, so this stand-in answers the exec, the dial of
// the tool port, the image add and the idle sleep on top of its impd. impd answers the rest.

interface FakeExec {
  readonly argv: readonly string[];

  readonly failsOnStop: boolean;
  readonly options: ImpExecOptions;
  readonly signals: string[];
}

interface FakeImage {
  readonly digest: string;
  readonly ref: string;
}

interface FakeImageAdd {
  readonly name: string;
  readonly ref: string;

  // how many calls impd had answered when the add came, to show the add before a later call
  readonly callsBefore: number;
}

interface FakeImp {
  readonly port: ImpPort;
  readonly guestToolPort: number;

  // whether a connection to the tool port in the imp's guest reaches its reverse forward
  readonly probeForward: (impName: string) => Promise<boolean>;

  readonly execs: FakeExec[];

  // the imps whose memory.events an exec read
  readonly memoryKillReads: string[];
  readonly images: Map<string, FakeImage>;
  readonly imageAdds: FakeImageAdd[];
  readonly events: FakeSleeps['events'];
  readonly sleepsAfterWake: FakeSleeps['sleepsAfterWake'];
  readonly startIdleSleep: FakeSleeps['startIdleSleep'];

  // a count the guest's memory.events holds, no such file, or a connection that drops mid-read
  memoryKills: number | 'missing' | 'lost';

  failExitOnStop: boolean;
  refuseImageAdd: boolean;
}

interface FakeState {
  readonly execs: FakeExec[];
  readonly memoryKillReads: string[];
  readonly images: Map<string, FakeImage>;
  readonly imageAdds: FakeImageAdd[];
  readonly stack: AsyncDisposableStack;

  memoryKills: FakeImp['memoryKills'];
  failExitOnStop: boolean;
  refuseImageAdd: boolean;
  execImp: string | null;
}

export async function startFakeImp(test: SharedImpdTest): Promise<FakeImp> {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const state: FakeState = {
    execs: [],
    memoryKillReads: [],
    images: new Map(),
    imageAdds: [],
    stack,
    memoryKills: 0,
    failExitOnStop: false,
    refuseImageAdd: false,
    execImp: null,
  };

  const guested = attachTestGuests(
    test.impd,
    buildImpPort({ url: test.impd.url, token: TEST_TOKEN }),
  );

  const sleeps = buildFakeSleeps(test.impd.client);

  const guestToolPort = await startToolBridge(state, guested.getGuest);

  const port: ImpPort = {
    ...guested.port,
    ...sleeps.guardWake(guested.port),
    ...sleeps.trackForwards(guested.port),
    ...buildFakeImageCalls(state, test),
    openExec: (name, argv, options) => {
      state.execImp = name;

      return Promise.resolve(openFakeExec({ state, test, sleeps }, name, argv, options));
    },
  };

  return Object.assign(state, {
    port,
    guestToolPort,
    probeForward: async (impName: string) => {
      const stream = await guested
        .getGuest(impName)
        .connect(guestToolPort)
        .catch(() => null);

      stream?.destroy();

      return stream !== null;
    },
    events: sleeps.events,
    sleepsAfterWake: sleeps.sleepsAfterWake,
    startIdleSleep: sleeps.startIdleSleep,
  });
}

// A process in the imp dials the tool port of the guest, and impd's reverse forward carries it to
// the host. The process here runs on the host, so a local listener on that port hands each
// connection to the guest of the imp that runs the exec.
async function startToolBridge(
  state: FakeState,
  getGuest: (impName: string) => TestGuest,
): Promise<number> {
  const sockets = new Set<Socket>();

  let port = 0;

  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('error', () => {});

    socket.once('close', () => {
      sockets.delete(socket);
    });

    void bridgeToGuest(getGuest, state, socket, port);
  });

  const listening = Promise.withResolvers<void>();

  server.listen(0, '127.0.0.1', listening.resolve);

  await listening.promise;

  const address = server.address();

  invariant(typeof address === 'object' && address !== null);

  port = address.port;

  state.stack.defer(() => {
    for (const socket of sockets) {
      socket.destroy();
    }

    server.close();
  });

  return port;
}

// impd closes a guest connection that no forward pairs within 10 s, and the stand-in guest never
// does, so a dial to a tool endpoint that is down waits for ever. The bridge ends it sooner.
const PAIRING_LIMIT_MS = 500;

async function bridgeToGuest(
  getGuest: (impName: string) => TestGuest,
  state: FakeState,
  socket: Socket,
  port: number,
): Promise<void> {
  try {
    invariant(state.execImp !== null, 'no exec has run, so no imp holds the tool port');

    const stream = await connectWithin(getGuest(state.execImp), port, PAIRING_LIMIT_MS);

    stream.on('error', () => {
      socket.destroy();
    });

    stream.once('close', () => {
      socket.destroy();
    });

    socket.once('close', () => {
      stream.destroy();
    });

    socket.pipe(stream);
    stream.pipe(socket);
  } catch {
    socket.destroy();
  }
}

async function connectWithin(guest: TestGuest, port: number, limitMs: number) {
  const timeout = Promise.withResolvers<never>();
  const timer = setTimeout(timeout.reject, limitMs, new Error('no forward paired the connection'));
  const connecting = guest.connect(port);

  void waitForSettled(timeout.promise);

  try {
    return await Promise.race([connecting, timeout.promise]);
  } finally {
    clearTimeout(timer);
  }
}

type FakeImageCalls = Pick<ImpPort, 'listImages' | 'addImage'>;

function buildFakeImageCalls(state: FakeState, test: SharedImpdTest): FakeImageCalls {
  return {
    listImages: () =>
      Promise.resolve(
        [...state.images].map(([name, held]) => ({ name, digest: held.digest, ref: held.ref })),
      ),
    addImage: (image) => {
      state.imageAdds.push({
        name: image.name,
        ref: image.ref,
        callsBefore: test.readCalls().length,
      });

      if (state.refuseImageAdd) {
        return Promise.reject(
          new Error('token nixie-test is limited to some imps; this call is host-wide'),
        );
      }

      state.images.set(image.name, { digest: image.digest, ref: image.ref });

      return Promise.resolve();
    },
  };
}

interface ExecDeps {
  readonly state: FakeState;
  readonly test: SharedImpdTest;
  readonly sleeps: FakeSleeps;
}

function openFakeExec(
  deps: ExecDeps,
  name: string,
  argv: readonly string[],
  options: ImpExecOptions,
): ImpExec {
  const wait = deps.sleeps.waitForAwake(name);

  if (isSameArgv(argv, memoryKillsArgv)) {
    deps.state.memoryKillReads.push(name);

    return createPendingExec(wait, async () => {
      await requireGrantForBroker(deps.test, name, options);

      return startFakeMemoryKillsExec(deps.state.memoryKills);
    });
  }

  const exec: FakeExec = { argv, options, signals: [], failsOnStop: deps.state.failExitOnStop };

  deps.state.execs.push(exec);

  return createPendingExec(wait, async () => {
    await requireGrantForBroker(deps.test, name, options);

    return startFakeExec(exec, deps.state.stack);
  });
}

function isSameArgv(argv: readonly string[], expected: readonly string[]): boolean {
  return argv.length === expected.length && argv.every((arg, index) => arg === expected[index]);
}

// impd refuses an exec that requires the broker on an imp with no grant, because it sets no broker
// variables there.
async function requireGrantForBroker(
  test: SharedImpdTest,
  name: string,
  options: ImpExecOptions,
): Promise<void> {
  if (!options.requireBroker) {
    return;
  }

  const grants = await test.impd.client.grants.details({ name });

  if (grants.length === 0) {
    throw new Error(
      'the broker is not ready for this exec: the imp has no grant, so impd sets no broker variables',
    );
  }
}

function startFakeMemoryKillsExec(memoryKills: FakeImp['memoryKills']): ImpExec {
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
