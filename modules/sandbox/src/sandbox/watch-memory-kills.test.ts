import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LogFields, LogLevel } from '@heynixie/logger';
import { waitForCondition } from '@heynixie/testing';
import { createProcessSandboxAdapter } from '../process/create-process-sandbox-adapter';
import { buildMockSandbox } from '../test-utils/build-mock-sandbox';
import { buildMockSandboxSpec } from '../test-utils/build-mock-sandbox-spec';
import { setupTestRecorder } from '../test-utils/setup-test-recorder';
import { startStubToolEndpoint } from '../test-utils/start-stub-tool-endpoint';
import { writeMemoryKills } from '../test-utils/write-memory-kills';
import type {
  ExecStream,
  MemoryKillRead,
  Sandbox,
  SandboxAdapter,
  SandboxSpec,
  StreamExit,
} from '../types';
import { watchMemoryKills } from './watch-memory-kills';

interface LoggedLine {
  readonly event: string;
  readonly fields: LogFields | undefined;
  readonly level: LogLevel | undefined;
}

interface WatchConfig {
  readonly readTimeoutMs?: number;
}

interface EndingProgram {
  readonly stream: ExecStream;
  readonly exit: StreamExit;
  readonly end: () => void;
}

function setupTest(config: WatchConfig = {}) {
  const answers: MemoryKillRead[] = [];

  const answerWith = (...results: readonly MemoryKillRead[]) => {
    answers.push(...results);

    return () => {
      const next = answers.length > 1 ? answers.shift() : answers[0];

      return Promise.resolve(next ?? { kind: 'failed' as const });
    };
  };

  const lines: LoggedLine[] = [];

  const log = (event: string, fields?: LogFields, level?: LogLevel): void => {
    lines.push({ event, fields, level });
  };

  const watch = (adapter: SandboxAdapter) =>
    watchMemoryKills(adapter, {
      log,
      ...(config.readTimeoutMs === undefined ? {} : { readTimeoutMs: config.readTimeoutMs }),
    });

  const collectLines = (prefix: string) => lines.filter((line) => line.event.startsWith(prefix));

  const startProcessAdapter = async () => {
    const stack = new AsyncDisposableStack();

    onTestFinished(() => stack.disposeAsync());

    const recorder = await setupTestRecorder();
    const rootDir = await mkdtemp(join(tmpdir(), 'nixie-watch-memory-kills-'));

    stack.defer(() => rm(rootDir, { recursive: true, force: true }));

    startStubToolEndpoint(join(rootDir, 'tools.sock'));

    const adapter = watch(
      createProcessSandboxAdapter({
        recorder: recorder.recorder,
        rootDir,
        toolTarget: () => ({ path: join(rootDir, 'tools.sock') }),
        hostEnv: {},
      }),
    );

    const createSandbox = async (spec: SandboxSpec): Promise<Sandbox> => {
      const sandbox = await adapter.create(spec);

      stack.defer(() => sandbox.destroy());

      return sandbox;
    };

    return { createSandbox };
  };

  // A sandbox whose spawn hands out programs that end when the test says, and whose read answers
  // from the test's own function. The events list holds the order of the sandbox's calls.
  const buildHandSandbox = (
    read: () => Promise<MemoryKillRead>,
    overrides: Partial<Sandbox> = {},
    events: string[] = [],
  ) => {
    const programs: EndingProgram[] = [];
    const reads = { started: 0 };

    const sandbox = buildMockSandbox({
      spawn: () => {
        const exit = Promise.withResolvers<StreamExit>();

        const value: StreamExit = {
          code: 0,
          signal: null,
          stderr: { bytes: new Uint8Array(0), totalBytes: 0, isCut: false },
        };

        const program: EndingProgram = {
          stream: {
            messages: new ReadableStream<Uint8Array<ArrayBuffer>>({
              start: (controller) => {
                controller.close();
              },
            }),
            send: () => Promise.resolve(),
            exit: exit.promise,
            stop: () => exit.promise,
          },
          exit: value,
          end: () => {
            exit.resolve(value);
          },
        };

        programs.push(program);
        events.push('spawn');

        return Promise.resolve(program.stream);
      },
      readMemoryKills: () => {
        reads.started += 1;

        return read();
      },
      destroy: () => {
        events.push('destroy');

        return Promise.resolve();
      },
      ...overrides,
    });

    const adapter = watch({
      id: 'hand',
      create: () => Promise.resolve(sandbox),
      read: () => Promise.resolve(sandbox),
      list: () => Promise.resolve([sandbox]),
      addSecret: () => Promise.resolve(),
      addImage: () => Promise.resolve(),
      checkRuntime: () => Promise.resolve({ isReady: true, reason: null }),
    });

    return { adapter, programs, events, reads, sandbox };
  };

  const startGatedSandbox = (overrides: Partial<Sandbox> = {}) => {
    const gate = Promise.withResolvers<void>();
    const events: string[] = [];

    const hand = buildHandSandbox(
      async () => {
        await gate.promise;

        events.push('read');

        const read: MemoryKillRead = { kind: 'count', kills: 0 };

        return read;
      },
      overrides,
      events,
    );

    return { ...hand, gate };
  };

  return {
    lines,
    collectLines,
    answerWith,
    startProcessAdapter,
    buildHandSandbox,
    startGatedSandbox,
    spawnSpec: { argv: ['run'], maxMessageBytes: 1024 },

    // the exit settles for the caller after the watcher's own handler ran, as for any caller
    endProgram: async (program: EndingProgram | undefined): Promise<void> => {
      program?.end();

      await program?.stream.exit;
    },
    listFieldValues: (found: readonly LoggedLine[], field: string) =>
      found.map((line) => line.fields?.[field]),
  };
}

test('it logs one memory kill line for a turn that ends after the count rose, and none when the count is the same', async () => {
  const ctx = setupTest();

  const sandboxes = await ctx.startProcessAdapter();

  const sandbox = await sandboxes.createSandbox(
    buildMockSandboxSpec({ kind: 'conversation', limits: { memoryMiB: 512 } }),
  );

  await writeMemoryKills(sandbox, 2);

  const first = await sandbox.spawn({ argv: ['sh', '-c', 'exit 0'], maxMessageBytes: 1024 });

  await first.exit;
  await waitForCondition(() => ctx.collectLines('sandbox.memory_kill').length === 1);

  const second = await sandbox.spawn({ argv: ['sh', '-c', 'exit 0'], maxMessageBytes: 1024 });

  await second.exit;

  await sandbox.destroy();

  expect(ctx.collectLines('sandbox.memory_kill')).toStrictEqual([
    {
      event: 'sandbox.memory_kill',
      level: 'error',
      fields: {
        ended: 'turn',
        kind: 'conversation',
        memoryMiB: 512,
        sandboxID: sandbox.id,
        kills: 2,
      },
    },
  ]);
});

test('it logs no line for a stop that kills the program, and keeps the exit and the stop value', async () => {
  const ctx = setupTest();

  const sandboxes = await ctx.startProcessAdapter();
  const sandbox = await sandboxes.createSandbox(buildMockSandboxSpec());
  const stream = await sandbox.spawn({ argv: ['sleep', '60'], maxMessageBytes: 1024 });
  const stopped = await stream.stop();
  const exit = await stream.exit;

  await sandbox.destroy();

  expect(ctx.collectLines('sandbox.memory_kill')).toStrictEqual([]);
  expect(stopped).toBe(exit);
  expect({ code: exit.code, signal: exit.signal }).toStrictEqual({ code: null, signal: 'SIGTERM' });
});

test('it logs the watch line once at info, and keeps the id of the adapter it wraps', () => {
  const ctx = setupTest();
  const hand = ctx.buildHandSandbox(ctx.answerWith({ kind: 'count', kills: 0 }));

  expect(hand.adapter.id).toBe('hand');
  expect(ctx.lines).toStrictEqual([{ event: 'sandbox.memory_watch', fields: {}, level: 'info' }]);
});

test('it logs an unsupported line at each end of a program on an adapter with no count', async () => {
  const ctx = setupTest();
  const hand = ctx.buildHandSandbox(ctx.answerWith({ kind: 'unsupported' }));

  const sandbox = await hand.adapter.create(buildMockSandboxSpec());

  const fields = {
    ended: 'step',
    kind: hand.sandbox.spec.kind,
    memoryMiB: hand.sandbox.spec.limits.memoryMiB,
    sandboxID: hand.sandbox.id,
    reason: 'unsupported',
  };

  await sandbox.spawn(ctx.spawnSpec);
  await ctx.endProgram(hand.programs[0]);
  await sandbox.spawn(ctx.spawnSpec);
  await ctx.endProgram(hand.programs[1]);
  await sandbox.destroy();

  expect(ctx.collectLines('sandbox.memory_kill')).toStrictEqual([
    { event: 'sandbox.memory_kill_unknown', level: 'warn', fields },
    { event: 'sandbox.memory_kill_unknown', level: 'warn', fields },
  ]);
});

test('it logs read_failed for a read that fails', async () => {
  const ctx = setupTest();
  const hand = ctx.buildHandSandbox(ctx.answerWith({ kind: 'failed' }));

  const sandbox = await hand.adapter.create(buildMockSandboxSpec());

  await sandbox.spawn(ctx.spawnSpec);
  await ctx.endProgram(hand.programs[0]);
  await sandbox.destroy();

  expect(ctx.listFieldValues(ctx.collectLines('sandbox.memory_kill'), 'reason')).toStrictEqual([
    'read_failed',
  ]);
});

test('it logs read_failed for a read past the timeout, and leaves the exit unchanged', async () => {
  const ctx = setupTest({ readTimeoutMs: 20 });
  const hand = ctx.buildHandSandbox(() => Promise.withResolvers<MemoryKillRead>().promise);

  const sandbox = await hand.adapter.create(buildMockSandboxSpec());
  const stream = await sandbox.spawn(ctx.spawnSpec);

  await ctx.endProgram(hand.programs[0]);
  await sandbox.destroy();

  const exit = await stream.exit;

  expect(exit === hand.programs[0]?.exit).toBeTrue();

  expect(ctx.listFieldValues(ctx.collectLines('sandbox.memory_kill'), 'reason')).toStrictEqual([
    'read_failed',
  ]);
});

test('it logs counter_reset for a count that fell', async () => {
  const ctx = setupTest();

  const hand = ctx.buildHandSandbox(
    ctx.answerWith({ kind: 'count', kills: 3 }, { kind: 'count', kills: 1 }),
  );

  const sandbox = await hand.adapter.create(buildMockSandboxSpec());

  await sandbox.spawn(ctx.spawnSpec);
  await ctx.endProgram(hand.programs[0]);
  await sandbox.spawn(ctx.spawnSpec);
  await ctx.endProgram(hand.programs[1]);
  await sandbox.destroy();

  const lines = ctx.collectLines('sandbox.memory_kill');

  expect(lines.map((line) => line.event)).toStrictEqual([
    'sandbox.memory_kill',
    'sandbox.memory_kill_unknown',
  ]);

  expect(ctx.listFieldValues(lines, 'reason')).toStrictEqual([undefined, 'counter_reset']);
});

test('it logs one no_baseline line before the first spawn of a read sandbox with a count above 0', async () => {
  const ctx = setupTest();
  const hand = ctx.buildHandSandbox(ctx.answerWith({ kind: 'count', kills: 2 }));

  const sandbox = await hand.adapter.read(hand.sandbox.id);

  await sandbox?.spawn(ctx.spawnSpec);

  const beforeEnd = ctx.listFieldValues(ctx.collectLines('sandbox.memory_kill'), 'reason');

  await ctx.endProgram(hand.programs[0]);
  await sandbox?.destroy();

  expect(beforeEnd).toStrictEqual(['no_baseline']);
  expect(ctx.collectLines('sandbox.memory_kill')).toHaveLength(1);
});

test('it logs no line for a listed sandbox with a count of 0', async () => {
  const ctx = setupTest();
  const hand = ctx.buildHandSandbox(ctx.answerWith({ kind: 'count', kills: 0 }));

  const [sandbox] = await hand.adapter.list(hand.sandbox.spec.owner);

  await sandbox?.spawn(ctx.spawnSpec);
  await ctx.endProgram(hand.programs[0]);
  await sandbox?.destroy();

  expect(ctx.collectLines('sandbox.memory_kill')).toStrictEqual([]);
});

test('it logs one line when 2 programs end together on one sandbox and the count rose once', async () => {
  const ctx = setupTest();
  const hand = ctx.buildHandSandbox(ctx.answerWith({ kind: 'count', kills: 1 }));

  const sandbox = await hand.adapter.create(buildMockSandboxSpec());

  await sandbox.spawn(ctx.spawnSpec);
  await sandbox.spawn(ctx.spawnSpec);
  await Promise.all([ctx.endProgram(hand.programs[0]), ctx.endProgram(hand.programs[1])]);
  await sandbox.destroy();

  expect(ctx.listFieldValues(ctx.collectLines('sandbox.memory_kill'), 'kills')).toStrictEqual([1]);
});

test('it waits for the pending read before it destroys the sandbox', async () => {
  const ctx = setupTest();
  const hand = ctx.startGatedSandbox();

  const sandbox = await hand.adapter.create(buildMockSandboxSpec());

  await sandbox.spawn(ctx.spawnSpec);
  await ctx.endProgram(hand.programs[0]);

  await waitForCondition(() => hand.reads.started === 1);

  const destroying = sandbox.destroy();

  hand.gate.resolve();

  await destroying;

  expect(hand.events).toStrictEqual(['spawn', 'read', 'destroy']);
});

test('it waits for the pending read before it sleeps the sandbox', async () => {
  const events: string[] = [];
  const ctx = setupTest();

  const hand = ctx.startGatedSandbox({
    suspension: {
      kind: 'memory',
      sleep: () => {
        events.push('sleep');

        return Promise.resolve();
      },
      wake: () => Promise.resolve(),
    },
  });

  const sandbox = await hand.adapter.create(buildMockSandboxSpec());

  await sandbox.spawn(ctx.spawnSpec);
  await ctx.endProgram(hand.programs[0]);

  await waitForCondition(() => hand.reads.started === 1);

  const sleeping = sandbox.suspension.kind === 'memory' ? sandbox.suspension.sleep() : null;

  hand.gate.resolve();

  await sleeping;

  expect([...hand.events, ...events]).toStrictEqual(['spawn', 'read', 'sleep']);
});

test('it waits for the pending read before the next spawn of the sandbox', async () => {
  const ctx = setupTest();
  const hand = ctx.startGatedSandbox();

  const sandbox = await hand.adapter.create(buildMockSandboxSpec());

  await sandbox.spawn(ctx.spawnSpec);
  await ctx.endProgram(hand.programs[0]);

  await waitForCondition(() => hand.reads.started === 1);

  const spawning = sandbox.spawn(ctx.spawnSpec);

  hand.gate.resolve();

  await spawning;

  expect(hand.events).toStrictEqual(['spawn', 'read', 'spawn']);
});

test('it logs read_failed for a program that ends after its sandbox began to be destroyed', async () => {
  const state = { isDestroyed: false };
  const ctx = setupTest();

  const hand = ctx.buildHandSandbox(
    () => {
      const read: MemoryKillRead = state.isDestroyed
        ? { kind: 'failed' }
        : { kind: 'count', kills: 0 };

      return Promise.resolve(read);
    },
    {
      destroy: () => {
        state.isDestroyed = true;

        return Promise.resolve();
      },
    },
  );

  const sandbox = await hand.adapter.create(buildMockSandboxSpec());

  await sandbox.spawn(ctx.spawnSpec);
  await sandbox.destroy();
  await ctx.endProgram(hand.programs[0]);

  await waitForCondition(() => ctx.collectLines('sandbox.memory_kill').length === 1);

  expect(ctx.listFieldValues(ctx.collectLines('sandbox.memory_kill'), 'reason')).toStrictEqual([
    'read_failed',
  ]);
});

test('it never reads after an exec', async () => {
  const output = { bytes: new Uint8Array(0), totalBytes: 0, isCut: false };
  const ctx = setupTest();

  const hand = ctx.buildHandSandbox(ctx.answerWith({ kind: 'count', kills: 5 }), {
    exec: () =>
      Promise.resolve({ code: 0, signal: null, stdout: output, stderr: output, durationMs: 1 }),
  });

  const sandbox = await hand.adapter.create(buildMockSandboxSpec());

  await sandbox.exec({ argv: ['true'] });
  await sandbox.destroy();

  expect(hand.reads.started).toBe(0);
});
