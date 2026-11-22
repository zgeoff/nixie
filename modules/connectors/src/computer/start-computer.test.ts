import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Sandbox } from '@heynixie/sandbox';
import { buildSandboxSpec, watchMemoryKills } from '@heynixie/sandbox';
import { waitForCondition } from '@heynixie/testing';
import type {
  ComputerHandler,
  ComputerReply,
  ComputerRequest,
  ComputerScanAsks,
  VNCFrame,
} from '@heynixie/wire';
import { runComputerGuest } from '@heynixie/wire';
import { createFakeClock } from '@zgeoff/testing/clock';
import { buildStubSandboxAdapter } from '../test-utils/build-stub-sandbox-adapter';
import { makeFolderExec, readDiskFiles, writeDiskFiles } from '../test-utils/make-folder-exec';
import type { OutOfCallScans } from './make-guest-session';
import { startComputer } from './start-computer';

interface SetupOptions {
  readonly answer?: ComputerHandler;
  readonly outOfCallScans?: OutOfCallScans;

  // a write to a file of the new disk that goes missing, by the path the command names
  readonly loseWrite?: (path: string) => boolean;

  // holds each wake of the sandbox until the promise settles
  readonly wakeGate?: Promise<void>;
}

interface WatchSetup {
  readonly connection: { readonly receive: (bytes: Uint8Array) => void; readonly end: () => void };
  readonly received: Uint8Array[];
  readonly closed: { isClosed: boolean };
}

async function setupTest(options: SetupOptions = {}) {
  const disks = await mkdtemp(join(tmpdir(), 'computer-disks-'));

  onTestFinished(async () => {
    await rm(disks, { recursive: true, force: true });
  });

  const clock = createFakeClock({ startMs: 0 });
  const log: { event: string; fields: Record<string, unknown> }[] = [];
  const state = { kills: 0, sleeps: 0, wakes: 0, guests: 0 };
  const asks: { current: ComputerScanAsks | null } = { current: null };
  const vnc: { frames: VNCFrame[] } = { frames: [] };

  const answerRequest: ComputerHandler =
    options.answer ??
    (() =>
      Promise.resolve({
        kind: 'run' as const,
        ok: true as const,
        run: {
          exitCode: 0,
          stdout: { text: 'ok', isCut: false },
          stderr: { text: '', isCut: false },
          seconds: 0,
          isDiskNew: true,
        },
      }));

  const stub = buildStubSandboxAdapter(
    async (stdin, stdout) => {
      state.guests += 1;

      await runComputerGuest(
        { input: stdin, write: (bytes) => stdout.write(bytes) },
        answerRequest,
        1_000_000,
        {
          onReady: (ready) => {
            asks.current = ready;
          },
          onVNCFrame: (frame, send) => {
            vnc.frames.push(frame);

            if (frame.kind === 'vnc-open') {
              void send({
                kind: 'vnc-data',
                stream: frame.stream,
                data: new TextEncoder().encode('RFB 003.008\n'),
              });
            }
          },
        },
      );

      return 0;
    },
    {
      readMemoryKills: () => Promise.resolve({ kind: 'count', kills: state.kills }),
      exec: makeFolderExec(disks, { loseWrite: (path) => options.loseWrite?.(path) === true }),
    },
  );

  const withSleep = {
    ...stub,
    create: async (spec: Parameters<typeof stub.create>[0]) => {
      const sandbox = await stub.create(spec);

      return {
        ...sandbox,
        destroy: () => sandbox.destroy(),
        suspension: {
          kind: 'memory' as const,
          sleep: () => {
            state.sleeps += 1;

            return Promise.resolve();
          },
          wake: async () => {
            state.wakes += 1;

            await options.wakeGate;
          },
        },
      } satisfies Sandbox;
    },
  };

  const adapter = watchMemoryKills(withSleep, {
    log: (event, fields) => {
      log.push({ event, fields: { ...fields } });
    },
  });

  const computer = startComputer({
    adapter,
    image: 'computer-image',
    argv: ['guest'],
    homeEnv: { HOME: '/home/computer' },
    legacyHomeEnv: { HOME: '/home/bun' },
    scans: options.outOfCallScans ?? {
      scan: () => Promise.resolve({ kind: 'pass' as const }),
      scanText: () => Promise.resolve({ kind: 'pass' as const }),
    },
    deniedRanges: [],
    timeZone: 'Pacific/Auckland',
    logger: () => {},
    clock,
    turnWaitMs: 100,
  });

  onTestFinished(async () => {
    await computer.stop();
  });

  return {
    stub,
    readDisk: (sandboxID: string) => readDiskFiles(disks, sandboxID),
    asks,
    vnc,
    openWatch: (): WatchSetup => {
      const received: Uint8Array[] = [];
      const closed = { isClosed: false };

      const connection = computer.watch({
        send: (bytes) => {
          received.push(bytes);
        },
        close: () => {
          closed.isClosed = true;
        },
      });

      return { connection, received, closed };
    },
    clock,
    log,
    state,
    computer,
    pass: () => Promise.resolve({ kind: 'pass' as const }),
    createOldSandbox: async (kind: 'browser' | 'shell', files: Record<string, string>) => {
      const sandbox = await stub.create(
        buildSandboxSpec({
          kind,
          image: `nixie-${kind}-old`,
          owner: `computer-${kind}`,
          limits: { vcpus: 1, memoryMiB: 512, diskMiB: 8192 },
        }),
      );

      await writeDiskFiles(disks, sandbox.id, files);

      return sandbox;
    },
    run: (command: string): ComputerRequest => ({
      op: 'run',
      argv: ['bash', '-lc', command],
      timeoutSeconds: 5,
    }),
  };
}

test('it creates one computer sandbox at its size and reuses it for the next call', async () => {
  const ctx = await setupTest();

  const first = await ctx.computer.call({
    request: ctx.run('ls'),
    scan: ctx.pass,
    scanText: ctx.pass,
    timeoutMs: 5000,
  });

  await ctx.computer.call({
    request: ctx.run('ls'),
    scan: ctx.pass,
    scanText: ctx.pass,
    timeoutMs: 5000,
  });

  expect(first).toMatchObject({ status: 'reply', reply: { kind: 'run' } });

  expect(ctx.stub.created.map((created) => created.spec)).toMatchObject([
    {
      kind: 'computer',
      owner: 'computer-desktop',
      egress: { kind: 'public' },
      grants: [],
      limits: { vcpus: 2, memoryMiB: 1536, diskMiB: 24_576 },
    },
  ]);

  expect(ctx.state.guests).toBe(1);
});

test('it returns busy to a call that waits past the limit for its turn', async () => {
  const gate = Promise.withResolvers<void>();

  const ctx = await setupTest({
    answer: async () => {
      await gate.promise;

      return { kind: 'closed', ok: true };
    },
  });

  const first = ctx.computer.call({
    request: ctx.run('a'),
    scan: ctx.pass,
    scanText: ctx.pass,
    timeoutMs: 5000,
  });

  await waitForCondition(() => ctx.stub.spawned.length === 1);

  const second = ctx.computer.call({
    request: ctx.run('b'),
    scan: ctx.pass,
    scanText: ctx.pass,
    timeoutMs: 5000,
  });

  ctx.clock.advance(100);

  const busy = await second;

  expect(busy).toStrictEqual({ status: 'busy' });

  gate.resolve();

  const done = await first;

  expect(done).toMatchObject({ status: 'reply' });
});

test('it returns out_of_memory and logs sandbox.memory_kill when the kill count rises in a call', async () => {
  const ctx = await setupTest({
    answer: () => {
      ctx.state.kills += 1;

      return Promise.resolve({ kind: 'closed', ok: true });
    },
  });

  const result = await ctx.computer.call({
    request: { op: 'close', tab: 't1' },
    scan: ctx.pass,
    scanText: ctx.pass,
    timeoutMs: 5000,
  });

  await waitForCondition(() => ctx.log.some((line) => line.event === 'sandbox.memory_kill'));

  expect(result).toStrictEqual({ status: 'out_of_memory' });

  expect(ctx.log.find((line) => line.event === 'sandbox.memory_kill')?.fields).toMatchObject({
    kind: 'computer',
    memoryMiB: 1536,
    kills: 1,
  });
});

test('it asks the text scan about the headers and body a guest is about to send', async () => {
  const texts: string[] = [];

  const ctx = await setupTest({
    answer: async (_request, _askScan, askScanText) => {
      try {
        await askScanText('POST body synthetic-secret');
      } catch {
        return { kind: 'failed', ok: false, reason: 'failed' };
      }

      return { kind: 'closed', ok: true };
    },
  });

  const result = await ctx.computer.call({
    request: ctx.run('a'),
    scan: ctx.pass,
    scanText: (text) => {
      texts.push(text);

      return Promise.resolve({ kind: 'refuse' as const, reason: 'holds a secret' });
    },
    timeoutMs: 5000,
  });

  expect(texts).toStrictEqual(['POST body synthetic-secret']);

  expect(result).toMatchObject({
    status: 'reply',
    reply: { kind: 'failed', reason: 'failed' },
    refusal: 'holds a secret',
  });
});

test('it asks the scan about each hop a guest sends and says why one was refused', async () => {
  const scanned: string[] = [];

  const ctx = await setupTest({
    answer: async (_request, askScan) => {
      try {
        await askScan('https://example.org/next');
      } catch {
        return { kind: 'failed', ok: false, reason: 'failed' };
      }

      return { kind: 'closed', ok: true };
    },
  });

  const result = await ctx.computer.call({
    request: { op: 'close', tab: 't1' },
    scan: (url) => {
      scanned.push(url);

      return Promise.resolve({ kind: 'refuse' as const, reason: 'holds a secret' });
    },
    scanText: ctx.pass,
    timeoutMs: 5000,
  });

  expect(scanned).toStrictEqual(['https://example.org/next']);

  expect(result).toMatchObject({
    status: 'reply',
    reply: { kind: 'failed', reason: 'failed' },
    refusal: 'holds a secret',
  });
});

test('it sleeps an idle sandbox, wakes it for the next call and starts its guest again', async () => {
  const ctx = await setupTest();

  await ctx.computer.call({
    request: ctx.run('a'),
    scan: ctx.pass,
    scanText: ctx.pass,
    timeoutMs: 5000,
  });

  ctx.clock.advance(30 * 60 * 1000);

  await waitForCondition(() => ctx.state.sleeps === 1);

  await ctx.computer.call({
    request: ctx.run('b'),
    scan: ctx.pass,
    scanText: ctx.pass,
    timeoutMs: 5000,
  });

  expect(ctx.state.wakes).toBe(1);
  expect(ctx.state.guests).toBe(2);
});

test('it keeps the computer awake for 30 minutes', async () => {
  const ctx = await setupTest();

  await ctx.computer.call({
    request: { op: 'close', tab: 't1' },
    scan: ctx.pass,
    scanText: ctx.pass,
    timeoutMs: 5000,
  });

  ctx.clock.advance(5 * 60 * 1000);

  expect(ctx.state.sleeps).toBe(0);

  ctx.clock.advance(25 * 60 * 1000);

  await waitForCondition(() => ctx.state.sleeps === 1);
});

test('it keeps a sandbox awake while a hold stands', async () => {
  const ctx = await setupTest();

  await ctx.computer.call({
    request: ctx.run('a'),
    scan: ctx.pass,
    scanText: ctx.pass,
    timeoutMs: 5000,
  });

  const release = ctx.computer.hold(72 * 60 * 60 * 1000);

  ctx.clock.advance(60 * 60 * 1000);

  expect(ctx.state.sleeps).toBe(0);

  release();

  ctx.clock.advance(30 * 60 * 1000);

  await waitForCondition(() => ctx.state.sleeps === 1);
});

test('it drops every tab at a wake, so a tab from before the sleep is gone', async () => {
  const ctx = await setupTest();

  await ctx.computer.call({
    request: { op: 'close', tab: 't1' },
    scan: ctx.pass,
    scanText: ctx.pass,
    timeoutMs: 5000,
  });

  const tab = ctx.computer.tabs.add('t1');

  ctx.clock.advance(30 * 60 * 1000);

  await waitForCondition(() => ctx.state.sleeps === 1);

  expect(ctx.computer.tabs.find(tab)).toBeNull();
});

test('it destroys a sandbox at a reset, and the next call makes an empty one', async () => {
  const ctx = await setupTest();

  await ctx.computer.call({
    request: ctx.run('a'),
    scan: ctx.pass,
    scanText: ctx.pass,
    timeoutMs: 5000,
  });

  await ctx.computer.reset();

  await ctx.computer.call({
    request: ctx.run('b'),
    scan: ctx.pass,
    scanText: ctx.pass,
    timeoutMs: 5000,
  });

  expect(ctx.stub.destroyed).toHaveLength(1);
  expect(ctx.stub.created).toHaveLength(2);
});

test('it starts the guest with the denied ranges, the time zone and the home of the disk', async () => {
  const ctx = await setupTest();

  await ctx.computer.call({
    request: ctx.run('ls'),
    scan: ctx.pass,
    scanText: ctx.pass,
    timeoutMs: 5000,
  });

  expect(ctx.stub.spawned.map((spawned) => spawned.env)).toStrictEqual([
    { HOME: '/home/computer', NIXIE_DENIED_RANGES: '', NIXIE_TIME_ZONE: 'Pacific/Auckland' },
  ]);
});

test('it scans a request that no call made with the scans of the computer and fails it', async () => {
  const scanned: string[] = [];
  const texts: string[] = [];

  const ctx = await setupTest({
    outOfCallScans: {
      scan: (url) => {
        scanned.push(url);

        return Promise.resolve({ kind: 'refuse' as const, reason: 'holds a secret' });
      },
      scanText: (text) => {
        texts.push(text);

        return Promise.resolve({ kind: 'pass' as const });
      },
    },
  });

  await ctx.computer.call({
    request: ctx.run('a'),
    scan: ctx.pass,
    scanText: ctx.pass,
    timeoutMs: 5000,
  });

  const settled = await Promise.allSettled([
    ctx.asks.current?.askScan('https://example.org/beacon'),
    ctx.asks.current?.askScanText('x-note: tide'),
  ]);

  expect({ scanned, texts, settled }).toStrictEqual({
    scanned: ['https://example.org/beacon'],
    texts: ['x-note: tide'],
    settled: [
      { status: 'rejected', reason: new Error('holds a secret') },
      { status: 'fulfilled', value: undefined },
    ],
  });
});

test('it lets a refused request of no call leave no refusal on the next call', async () => {
  const ctx = await setupTest({
    outOfCallScans: {
      scan: () => Promise.resolve({ kind: 'refuse' as const, reason: 'holds a secret' }),
      scanText: () => Promise.resolve({ kind: 'pass' as const }),
    },
  });

  await ctx.computer.call({
    request: ctx.run('a'),
    scan: ctx.pass,
    scanText: ctx.pass,
    timeoutMs: 5000,
  });

  await ctx.asks.current?.askScan('https://example.org/beacon').catch(() => {});

  const result = await ctx.computer.call({
    request: ctx.run('b'),
    scan: ctx.pass,
    scanText: ctx.pass,
    timeoutMs: 5000,
  });

  expect(result).toMatchObject({ status: 'reply', refusal: null });
});

test('it keeps the guest when a command takes the memory kill, and stops it for any other call', async () => {
  const ctx = await setupTest({
    answer: (request) => {
      ctx.state.kills += 1;

      const reply: ComputerReply =
        request.op === 'run'
          ? {
              kind: 'run',
              ok: true,
              run: {
                exitCode: 137,
                stdout: { text: '', isCut: false },
                stderr: { text: '', isCut: false },
                seconds: 0,
                isDiskNew: false,
              },
            }
          : { kind: 'closed', ok: true };

      return Promise.resolve(reply);
    },
  });

  const call = (request: ComputerRequest) =>
    ctx.computer.call({ request, scan: ctx.pass, scanText: ctx.pass, timeoutMs: 5000 });

  const first = await call(ctx.run('a'));
  const second = await call(ctx.run('b'));

  const guestsAfterRuns = ctx.state.guests;

  await call({ op: 'close', tab: 't1' });
  await call(ctx.run('c'));

  expect({ first, second, guestsAfterRuns, guests: ctx.state.guests }).toStrictEqual({
    first: { status: 'out_of_memory' },
    second: { status: 'out_of_memory' },
    guestsAfterRuns: 1,
    guests: 2,
  });
});

test('it copies the profile and the files of the earlier release into the new disk and destroys both old sandboxes', async () => {
  const ctx = await setupTest();

  const browser = await ctx.createOldSandbox('browser', {
    '/home/bun/profile/Default/Cookies': 'cookie-bytes',
    '/home/bun/profile/Local State': '{"sign":"in"}',
  });

  const shell = await ctx.createOldSandbox('shell', {
    '/home/bun/files/notes/tides.md': 'high at six',
    '/home/bun/files/downloads/report.txt': 'report body',
  });

  const result = await ctx.computer.call({
    request: ctx.run('ls'),
    scan: ctx.pass,
    scanText: ctx.pass,
    timeoutMs: 5000,
  });

  const created = ctx.stub.created.find((entry) => entry.spec.kind === 'computer');

  const copied = await ctx.readDisk(created?.id ?? '');

  expect(result).toMatchObject({ status: 'reply' });
  expect(ctx.stub.destroyed).toIncludeSameMembers([browser.id, shell.id]);

  expect(copied).toIncludeSameMembers([
    ['/home/computer/profile/Default/Cookies', 'cookie-bytes'],
    ['/home/computer/profile/Local State', '{"sign":"in"}'],
    ['/home/computer/files/notes/tides.md', 'high at six'],
    ['/home/computer/files/downloads/report.txt', 'report body'],
  ]);

  expect([...(ctx.stub.files.get(created?.id ?? '')?.keys() ?? [])]).toStrictEqual([
    '/home/computer/.nixie-disk-used',
  ]);
});

test('it answers moving and destroys nothing when a copy fails its check, and moves at the next call', async () => {
  const drop = { enabled: true };

  const ctx = await setupTest({
    loseWrite: (path) => drop.enabled && path.endsWith('Local State'),
  });

  const browser = await ctx.createOldSandbox('browser', {
    '/home/bun/profile/Default/Cookies': 'cookie-bytes',
    '/home/bun/profile/Local State': '{"sign":"in"}',
  });

  const shell = await ctx.createOldSandbox('shell', {
    '/home/bun/files/notes/tides.md': 'high at six',
    '/home/bun/files/downloads/report.txt': 'report body',
  });

  const failed = await ctx.computer.call({
    request: ctx.run('ls'),
    scan: ctx.pass,
    scanText: ctx.pass,
    timeoutMs: 5000,
  });

  const destroyedAfterFailure = [...ctx.stub.destroyed];

  drop.enabled = false;

  const retried = await ctx.computer.call({
    request: ctx.run('ls'),
    scan: ctx.pass,
    scanText: ctx.pass,
    timeoutMs: 5000,
  });

  expect({ failed, destroyedAfterFailure, spawnedBefore: ctx.state.guests }).toStrictEqual({
    failed: { status: 'moving' },
    destroyedAfterFailure: [],
    spawnedBefore: 1,
  });

  expect(retried).toMatchObject({ status: 'reply' });
  expect(ctx.stub.destroyed).toIncludeSameMembers([browser.id, shell.id]);
});

test('it starts no guest while the move has not succeeded', async () => {
  const ctx = await setupTest({ loseWrite: (path) => path.endsWith('Cookies') });

  await ctx.createOldSandbox('browser', {
    '/home/bun/profile/Default/Cookies': 'cookie-bytes',
    '/home/bun/profile/Local State': '{"sign":"in"}',
  });

  await ctx.computer.call({
    request: ctx.run('ls'),
    scan: ctx.pass,
    scanText: ctx.pass,
    timeoutMs: 5000,
  });

  expect(ctx.stub.spawned).toStrictEqual([]);
});

test('it moves a lone browser sandbox and finds nothing to move at the next call', async () => {
  const ctx = await setupTest();

  const browser = await ctx.createOldSandbox('browser', {
    '/home/bun/profile/Default/Cookies': 'cookie-bytes',
    '/home/bun/profile/Local State': '{"sign":"in"}',
  });

  await ctx.computer.call({
    request: ctx.run('a'),
    scan: ctx.pass,
    scanText: ctx.pass,
    timeoutMs: 5000,
  });

  const gate = await ctx.computer.settleMove();

  expect({ gate, destroyed: ctx.stub.destroyed }).toStrictEqual({
    gate: 'ready',
    destroyed: [browser.id],
  });
});

test('it settles the move without a call and answers moving while it has not succeeded', async () => {
  const ctx = await setupTest({ loseWrite: (path) => path.endsWith('tides.md') });

  await ctx.createOldSandbox('shell', {
    '/home/bun/files/notes/tides.md': 'high at six',
    '/home/bun/files/downloads/report.txt': 'report body',
  });

  const gate = await ctx.computer.settleMove();

  expect(gate).toBe('moving');
});

test('it destroys the sandboxes of the earlier release at a reset, so no later move brings their data back', async () => {
  const ctx = await setupTest();

  const browser = await ctx.createOldSandbox('browser', {
    '/home/bun/profile/Default/Cookies': 'cookie-bytes',
    '/home/bun/profile/Local State': '{"sign":"in"}',
  });

  await ctx.computer.reset();

  await ctx.computer.call({
    request: ctx.run('a'),
    scan: ctx.pass,
    scanText: ctx.pass,
    timeoutMs: 5000,
  });

  const created = ctx.stub.created.find((entry) => entry.spec.kind === 'computer');

  expect(ctx.stub.destroyed).toStrictEqual([browser.id]);

  const files = await ctx.readDisk(created?.id ?? '');

  expect(files).toStrictEqual([]);
});

test('it wakes a sleeping sandbox for a watch and relays the desktop stream to its socket', async () => {
  const ctx = await setupTest();

  await ctx.computer.call({
    request: ctx.run('a'),
    scan: ctx.pass,
    scanText: ctx.pass,
    timeoutMs: 5000,
  });

  ctx.clock.advance(30 * 60 * 1000);

  await waitForCondition(() => ctx.state.sleeps === 1);

  const watch = ctx.openWatch();

  await waitForCondition(() => watch.received.length === 1);

  expect([
    new TextDecoder().decode(watch.received[0]),
    ctx.state.wakes,
    ctx.state.guests,
  ]).toStrictEqual(['RFB 003.008\n', 1, 2]);
});

test('it counts a watch as open before the sandbox has woken', async () => {
  const gate = Promise.withResolvers<void>();

  const ctx = await setupTest({ wakeGate: gate.promise });

  await ctx.computer.call({
    request: ctx.run('a'),
    scan: ctx.pass,
    scanText: ctx.pass,
    timeoutMs: 5000,
  });

  ctx.clock.advance(30 * 60 * 1000);

  await waitForCondition(() => ctx.state.sleeps === 1);

  const before = ctx.computer.isWatched();

  ctx.openWatch();

  expect([before, ctx.computer.isWatched()]).toStrictEqual([false, true]);

  gate.resolve();
});

test('it reports not watched when the last watch closes, and not before', async () => {
  const ctx = await setupTest();

  const first = ctx.openWatch();
  const second = ctx.openWatch();

  first.connection.end();

  const afterFirst = ctx.computer.isWatched();

  second.connection.end();

  expect([afterFirst, ctx.computer.isWatched()]).toStrictEqual([true, false]);
});

test('it counts a watch that ends twice once', async () => {
  const ctx = await setupTest();

  const first = ctx.openWatch();

  ctx.openWatch();
  first.connection.end();
  first.connection.end();

  expect(ctx.computer.isWatched()).toBe(true);
});

test('it keeps the sandbox awake for a watch until it closes', async () => {
  const ctx = await setupTest();

  const watch = ctx.openWatch();

  await waitForCondition(() => watch.received.length === 1);

  ctx.clock.advance(5 * 60 * 60 * 1000);

  const sleepsWhileWatched = ctx.state.sleeps;

  watch.connection.end();
  ctx.clock.advance(30 * 60 * 1000);

  await waitForCondition(() => ctx.state.sleeps === 1);

  expect(sleepsWhileWatched).toBe(0);
});

test('it opens no stream and releases the hold when a watch closes during the wake', async () => {
  const gate = Promise.withResolvers<void>();

  const ctx = await setupTest({ wakeGate: gate.promise });

  await ctx.computer.call({
    request: ctx.run('a'),
    scan: ctx.pass,
    scanText: ctx.pass,
    timeoutMs: 5000,
  });

  ctx.clock.advance(30 * 60 * 1000);

  await waitForCondition(() => ctx.state.sleeps === 1);

  const watch = ctx.openWatch();

  await waitForCondition(() => ctx.state.wakes === 1);

  watch.connection.end();
  gate.resolve();

  await waitForCondition(() => {
    ctx.clock.advance(30 * 60 * 1000);

    return ctx.state.sleeps === 2;
  });

  expect(ctx.vnc.frames).toStrictEqual([]);
});

test('it closes a watch that floods the wake with requests, and releases the hold', async () => {
  const gate = Promise.withResolvers<void>();

  const ctx = await setupTest({ wakeGate: gate.promise });

  await ctx.computer.call({
    request: ctx.run('a'),
    scan: ctx.pass,
    scanText: ctx.pass,
    timeoutMs: 5000,
  });

  ctx.clock.advance(30 * 60 * 1000);

  await waitForCondition(() => ctx.state.sleeps === 1);

  const watch = ctx.openWatch();

  await waitForCondition(() => ctx.state.wakes === 1);

  watch.connection.receive(new Uint8Array([...new TextEncoder().encode('RFB 003.008\n'), 1, 1]));

  for (let sent = 0; sent < 7000; sent += 1) {
    watch.connection.receive(new Uint8Array([3, 1, 0, 0, 0, 0, 5, 0, 3, 32]));
  }

  gate.resolve();

  await waitForCondition(() => {
    ctx.clock.advance(30 * 60 * 1000);

    return ctx.state.sleeps === 2;
  });

  expect([watch.closed.isClosed, ctx.computer.isWatched(), ctx.vnc.frames]).toStrictEqual([
    true,
    false,
    [],
  ]);
});

test('it never makes a call wait for the turn because of a watch', async () => {
  const ctx = await setupTest();

  const watch = ctx.openWatch();

  await waitForCondition(() => watch.received.length === 1);

  const result = await ctx.computer.call({
    request: ctx.run('a'),
    scan: ctx.pass,
    scanText: ctx.pass,
    timeoutMs: 5000,
  });

  expect(result).toMatchObject({ status: 'reply' });
});

test('it passes the viewer handshake and viewing messages to the guest and drops its input', async () => {
  const ctx = await setupTest();

  const watch = ctx.openWatch();

  await waitForCondition(() => watch.received.length === 1);

  const handshake = new Uint8Array([...new TextEncoder().encode('RFB 003.008\n'), 1, 1]);
  const request = new Uint8Array([3, 1, 0, 0, 0, 0, 5, 0, 3, 32]);

  watch.connection.receive(handshake);
  watch.connection.receive(new Uint8Array([4, 1, 0, 0, 0, 0, 0, 97]));
  watch.connection.receive(new Uint8Array([5, 1, 0, 10, 0, 20]));
  watch.connection.receive(request);

  await waitForCondition(() => ctx.vnc.frames.length === 5);

  expect(
    ctx.vnc.frames.flatMap((frame) => (frame.kind === 'vnc-data' ? [[...frame.data]] : [])),
  ).toStrictEqual([[...handshake.subarray(0, 12)], [1], [1], [...request]]);
});

test('it closes the socket and the stream of a watch whose viewer sends a message it cannot read', async () => {
  const ctx = await setupTest();

  const watch = ctx.openWatch();

  await waitForCondition(() => watch.received.length === 1);

  watch.connection.receive(new Uint8Array([...new TextEncoder().encode('RFB 003.008\n'), 1, 1]));
  watch.connection.receive(new Uint8Array([200]));

  await waitForCondition(() => ctx.vnc.frames.some((frame) => frame.kind === 'vnc-close'));

  expect([watch.closed.isClosed, ctx.computer.isWatched()]).toStrictEqual([true, false]);
});

test('it tells the guest to close the stream when a watch ends', async () => {
  const ctx = await setupTest();

  const watch = ctx.openWatch();

  await waitForCondition(() => watch.received.length === 1);

  watch.connection.end();

  await waitForCondition(() => ctx.vnc.frames.some((frame) => frame.kind === 'vnc-close'));

  expect(ctx.vnc.frames.at(-1)).toMatchObject({ kind: 'vnc-close' });
});

test('it relays the desktop to a second watch after the first one ended', async () => {
  const ctx = await setupTest();

  const first = ctx.openWatch();

  await waitForCondition(() => first.received.length === 1);

  first.connection.end();

  await waitForCondition(() => ctx.vnc.frames.some((frame) => frame.kind === 'vnc-close'));

  const second = ctx.openWatch();

  await waitForCondition(() => second.received.length === 1);

  expect(new TextDecoder().decode(second.received[0])).toBe('RFB 003.008\n');
});
