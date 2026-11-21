import { expect, onTestFinished, test } from 'bun:test';
import type { Sandbox } from '@heynixie/sandbox';
import { watchMemoryKills } from '@heynixie/sandbox';
import { buildTestClock, waitForCondition } from '@heynixie/testing';
import type { ComputerHandler, ComputerRequest } from '@heynixie/wire';
import { runComputerGuest } from '@heynixie/wire';
import { buildStubSandboxAdapter } from '../test-utils/build-stub-sandbox-adapter';
import { startComputer } from './start-computer';

interface SetupOptions {
  readonly answer?: ComputerHandler;
}

function setupTest(options: SetupOptions = {}) {
  const clock = buildTestClock(0);
  const log: { event: string; fields: Record<string, unknown> }[] = [];
  const state = { kills: 0, sleeps: 0, wakes: 0, guests: 0 };

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
      );

      return 0;
    },
    { readMemoryKills: () => Promise.resolve({ kind: 'count', kills: state.kills }) },
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
    images: { browser: 'browser-image', shell: 'shell-image' },
    argv: { browser: ['guest'], shell: ['guest'] },
    deniedRanges: [],
    logger: () => {},
    clock,
    turnWaitMs: 100,
  });

  onTestFinished(async () => {
    await computer.stop();
  });

  return {
    stub,
    clock,
    log,
    state,
    computer,
    pass: () => Promise.resolve({ kind: 'pass' as const }),
    run: (command: string): ComputerRequest => ({
      op: 'run',
      argv: ['bash', '-lc', command],
      timeoutSeconds: 5,
    }),
  };
}

test('it creates one sandbox of the kind at its size and reuses it for the next call', async () => {
  const ctx = setupTest();

  const first = await ctx.computer.call('shell', {
    request: ctx.run('ls'),
    scan: ctx.pass,
    timeoutMs: 5000,
  });

  await ctx.computer.call('shell', { request: ctx.run('ls'), scan: ctx.pass, timeoutMs: 5000 });

  expect(first).toMatchObject({ status: 'reply', reply: { kind: 'run' } });

  expect(ctx.stub.created.map((created) => created.spec)).toMatchObject([
    {
      kind: 'shell',
      owner: 'computer-shell',
      egress: { kind: 'public' },
      grants: [],
      limits: { vcpus: 1, memoryMiB: 512, diskMiB: 16_384 },
    },
  ]);

  expect(ctx.state.guests).toBe(1);
});

test('it gives the browser 1 GiB of memory', async () => {
  const ctx = setupTest();

  await ctx.computer.call('browser', {
    request: { op: 'close', tab: 't1' },
    scan: ctx.pass,
    timeoutMs: 5000,
  });

  expect(ctx.stub.created[0]?.spec.limits).toStrictEqual({
    vcpus: 2,
    memoryMiB: 1024,
    diskMiB: 8192,
  });
});

test('it returns busy to a call that waits past the limit for its turn', async () => {
  const gate = Promise.withResolvers<void>();

  const ctx = setupTest({
    answer: async () => {
      await gate.promise;

      return { kind: 'closed', ok: true };
    },
  });

  const first = ctx.computer.call('shell', {
    request: ctx.run('a'),
    scan: ctx.pass,
    timeoutMs: 5000,
  });

  await waitForCondition(() => ctx.stub.spawned.length === 1);

  const second = ctx.computer.call('shell', {
    request: ctx.run('b'),
    scan: ctx.pass,
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

  const result = await ctx.computer.call('browser', {
    request: { op: 'close', tab: 't1' },
    scan: ctx.pass,
    timeoutMs: 5000,
  });

  await waitForCondition(() => ctx.log.some((line) => line.event === 'sandbox.memory_kill'));

  expect(result).toStrictEqual({ status: 'out_of_memory' });

  expect(ctx.log.find((line) => line.event === 'sandbox.memory_kill')?.fields).toMatchObject({
    kind: 'browser',
    memoryMiB: 1024,
    kills: 1,
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

  const result = await ctx.computer.call('browser', {
    request: { op: 'close', tab: 't1' },
    scan: (url) => {
      scanned.push(url);

      return Promise.resolve({ kind: 'refuse' as const, reason: 'holds a secret' });
    },
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

  await ctx.computer.call('shell', { request: ctx.run('a'), scan: ctx.pass, timeoutMs: 5000 });

  ctx.clock.advance(5 * 60 * 1000);

  await waitForCondition(() => ctx.state.sleeps === 1);

  await ctx.computer.call('shell', { request: ctx.run('b'), scan: ctx.pass, timeoutMs: 5000 });

  expect(ctx.state.wakes).toBe(1);
  expect(ctx.state.guests).toBe(2);
});

test('it keeps a browser awake for 30 minutes and a shell for 5', async () => {
  const ctx = setupTest();

  await ctx.computer.call('browser', {
    request: { op: 'close', tab: 't1' },
    scan: ctx.pass,
    timeoutMs: 5000,
  });

  ctx.clock.advance(5 * 60 * 1000);

  expect(ctx.state.sleeps).toBe(0);

  ctx.clock.advance(25 * 60 * 1000);

  await waitForCondition(() => ctx.state.sleeps === 1);
});

test('it keeps a sandbox awake while a hold stands', async () => {
  const ctx = setupTest();

  await ctx.computer.call('shell', { request: ctx.run('a'), scan: ctx.pass, timeoutMs: 5000 });

  const release = ctx.computer.hold('shell', 72 * 60 * 60 * 1000);

  ctx.clock.advance(60 * 60 * 1000);

  expect(ctx.state.sleeps).toBe(0);

  release();

  ctx.clock.advance(5 * 60 * 1000);

  await waitForCondition(() => ctx.state.sleeps === 1);
});

test('it drops every tab at a wake, so a tab from before the sleep is gone', async () => {
  const ctx = setupTest();

  await ctx.computer.call('browser', {
    request: { op: 'close', tab: 't1' },
    scan: ctx.pass,
    timeoutMs: 5000,
  });

  const tab = ctx.computer.tabs.add('t1');

  ctx.clock.advance(30 * 60 * 1000);

  await waitForCondition(() => ctx.state.sleeps === 1);

  expect(ctx.computer.tabs.find(tab)).toBeNull();
});

test('it destroys a sandbox at a reset, and the next call makes an empty one', async () => {
  const ctx = setupTest();

  await ctx.computer.call('shell', { request: ctx.run('a'), scan: ctx.pass, timeoutMs: 5000 });
  await ctx.computer.reset(['shell']);
  await ctx.computer.call('shell', { request: ctx.run('b'), scan: ctx.pass, timeoutMs: 5000 });

  expect(ctx.stub.destroyed).toHaveLength(1);
  expect(ctx.stub.created).toHaveLength(2);
});
