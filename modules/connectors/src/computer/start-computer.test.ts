import { expect, onTestFinished, test } from 'bun:test';
import type { Sandbox } from '@heynixie/sandbox';
import { buildSandboxSpec, watchMemoryKills } from '@heynixie/sandbox';
import { waitForCondition } from '@heynixie/testing';
import type {
  ComputerHandler,
  ComputerReply,
  ComputerRequest,
  ComputerScanAsks,
} from '@heynixie/wire';
import { runComputerGuest } from '@heynixie/wire';
import { createFakeClock } from '@zgeoff/testing/clock';
import { buildStubSandboxAdapter } from '../test-utils/build-stub-sandbox-adapter';
import type { OutOfCallScans } from './make-guest-session';
import { startComputer } from './start-computer';

interface SetupOptions {
  readonly answer?: ComputerHandler;
  readonly outOfCallScans?: OutOfCallScans;
  readonly skipCopyIn?: (path: string) => boolean;
}

function setupTest(options: SetupOptions = {}) {
  const clock = createFakeClock({ startMs: 0 });
  const log: { event: string; fields: Record<string, unknown> }[] = [];
  const state = { kills: 0, sleeps: 0, wakes: 0, guests: 0 };
  const asks: { current: ComputerScanAsks | null } = { current: null };

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
        },
      );

      return 0;
    },
    {
      readMemoryKills: () => Promise.resolve({ kind: 'count', kills: state.kills }),
      ...(options.skipCopyIn === undefined ? {} : { skipCopyIn: options.skipCopyIn }),
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
          wake: () => {
            state.wakes += 1;

            return Promise.resolve();
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
    asks,
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

      for (const [path, text] of Object.entries(files)) {
        stub.files.get(sandbox.id)?.set(path, new TextEncoder().encode(text));
      }

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
  const ctx = setupTest();

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

  const ctx = setupTest({
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
  const ctx = setupTest({
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

  const ctx = setupTest({
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

  const ctx = setupTest({
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
  const ctx = setupTest();

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
  const ctx = setupTest();

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
  const ctx = setupTest();

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
  const ctx = setupTest();

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
  const ctx = setupTest();

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
  const ctx = setupTest();

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

  const ctx = setupTest({
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
  const ctx = setupTest({
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
  const ctx = setupTest({
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
  const ctx = setupTest();

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
  const copied = ctx.stub.files.get(created?.id ?? '');

  expect(result).toMatchObject({ status: 'reply' });
  expect(ctx.stub.destroyed).toIncludeSameMembers([browser.id, shell.id]);

  expect(
    [...(copied?.entries() ?? [])].map(([path, content]) => [
      path,
      new TextDecoder().decode(content),
    ]),
  ).toIncludeSameMembers([
    ['/home/computer/profile/Default/Cookies', 'cookie-bytes'],
    ['/home/computer/profile/Local State', '{"sign":"in"}'],
    ['/home/computer/files/notes/tides.md', 'high at six'],
    ['/home/computer/files/downloads/report.txt', 'report body'],
    ['/home/computer/.nixie-disk-used', ''],
  ]);
});

test('it answers moving and destroys nothing when a copy fails its check, and moves at the next call', async () => {
  const drop = { enabled: true };

  const ctx = setupTest({
    skipCopyIn: (path) => drop.enabled && path.endsWith('Local State'),
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
  const ctx = setupTest({ skipCopyIn: (path) => path.endsWith('Cookies') });

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
  const ctx = setupTest();

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
  const ctx = setupTest({ skipCopyIn: (path) => path.endsWith('tides.md') });

  await ctx.createOldSandbox('shell', {
    '/home/bun/files/notes/tides.md': 'high at six',
    '/home/bun/files/downloads/report.txt': 'report body',
  });

  const gate = await ctx.computer.settleMove();

  expect(gate).toBe('moving');
});

test('it destroys the sandboxes of the earlier release at a reset, so no later move brings their data back', async () => {
  const ctx = setupTest();

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
  expect([...(ctx.stub.files.get(created?.id ?? '')?.keys() ?? [])]).toStrictEqual([]);
});
