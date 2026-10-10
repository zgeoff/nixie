import { expect, test } from 'bun:test';
import { join } from 'node:path';
import type { ExecStream, GrantSpec, Sandbox, SandboxSpec } from '@heynixie/sandbox';
import { SandboxSpecRefusedError } from '@heynixie/sandbox';
import { setupProcessAdapter } from './test-utils/setup-process-adapter';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const modelGrant: GrantSpec = {
  secret: 'model-default',
  host: 'api.anthropic.com',
  env: { ANTHROPIC_API_KEY: 'broker-placeholder' },
};

const workerSpec: SandboxSpec = {
  kind: 'worker',
  image: 'worker',
  owner: 'task-1:step-2',
  egress: { kind: 'none' },
  grants: [modelGrant],
  toolRoute: true,
  limits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
};

async function runText(
  sandbox: Sandbox,
  argv: readonly string[],
  env: Readonly<Record<string, string>> = {},
) {
  const result = await sandbox.exec({ argv, env });

  return decoder.decode(result.stdout.bytes);
}

function getMemorySuspension(sandbox: Sandbox): Extract<Sandbox['suspension'], { kind: 'memory' }> {
  if (sandbox.suspension.kind !== 'memory') {
    throw new Error('the double keeps memory');
  }
  return sandbox.suspension;
}

async function runLifecycle(sandbox: Sandbox): Promise<void> {
  const suspension = getMemorySuspension(sandbox);

  await suspension.sleep();
  await suspension.wake();
}

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- an async iterable has no readonly form
async function readNextMessage(stream: ExecStream): Promise<string> {
  const next = await stream.messages[Symbol.asyncIterator]().next();

  if (next.done === true) {
    throw new Error('the stream ended');
  }
  return decoder.decode(next.value);
}

test('it records every create, grant, sleep, wake and destroy', async () => {
  const ctx = await setupProcessAdapter();
  const sandbox = await ctx.adapter.create(workerSpec);

  await runLifecycle(sandbox);
  await sandbox.destroy();

  const records = await ctx.readSandboxRecords();

  expect(records.map((record) => [record.kind, record.payload['sandboxID']])).toStrictEqual([
    ['sandbox.created', sandbox.id],
    ['sandbox.granted', sandbox.id],
    ['sandbox.slept', sandbox.id],
    ['sandbox.woken', sandbox.id],
    ['sandbox.destroyed', sandbox.id],
  ]);
});

test('list returns every sandbox of the owner until it is destroyed', async () => {
  const ctx = await setupProcessAdapter();
  const first = await ctx.createSandbox(workerSpec);
  const second = await ctx.createSandbox({ ...workerSpec, grants: [] });

  await ctx.createSandbox({ ...workerSpec, owner: 'task-9:step-1' });

  const before = await ctx.adapter.list('task-1:step-2');

  await first.destroy();

  const after = await ctx.adapter.list('task-1:step-2');

  expect(before.map((sandbox) => sandbox.id)).toStrictEqual([first.id, second.id]);
  expect(after.map((sandbox) => sandbox.id)).toStrictEqual([second.id]);
});

test('a restarted adapter lists what the last one made, so recovery destroys it', async () => {
  const ctx = await setupProcessAdapter();
  const made = await ctx.adapter.create(workerSpec);
  const restarted = ctx.buildAdapter();
  const [orphan] = await restarted.list('task-1:step-2');

  await orphan?.destroy();

  const found = await restarted.get(made.id);
  const hasDirectory = await Bun.file(join(ctx.rootDir, made.id, 'fs')).exists();

  expect(orphan?.id).toBe(made.id);
  expect(found).toBeNull();
  expect(hasDirectory).toBeFalse();
});

test.each([
  [{ ...workerSpec, kind: 'fetch', egress: { kind: 'public' } }, 'public egress with a grant'],
  [
    { ...workerSpec, egress: { kind: 'allow', hosts: ['github.com'] } },
    'a grant with egress outside a coding session (worker)',
  ],
] as const)('it refuses a spec and writes no record: %#', async (spec, reason) => {
  const ctx = await setupProcessAdapter();

  expect(ctx.adapter.create(spec)).rejects.toThrow(new SandboxSpecRefusedError(reason));

  const records = await ctx.readSandboxRecords();

  expect(records).toStrictEqual([]);
});

test('it cuts exec output past 1 MiB per stream', async () => {
  const ctx = await setupProcessAdapter();
  const sandbox = await ctx.createSandbox(workerSpec);
  const result = await sandbox.exec({
    argv: ['sh', '-c', 'head -c 2097152 /dev/zero; echo err >&2'],
  });

  expect(result).toMatchObject({
    code: 0,
    signal: null,
    stdout: { totalBytes: 2_097_152, isCut: true },
    stderr: { totalBytes: 4, isCut: false },
  });
  expect(result.stdout.bytes.byteLength).toBe(1_048_576);
});

test('it passes the grant placeholders and keeps the loopback on NO_PROXY', async () => {
  const ctx = await setupProcessAdapter();
  const sandbox = await ctx.createSandbox(workerSpec);
  const text = await runText(sandbox, ['sh', '-c', 'echo "$ANTHROPIC_API_KEY $NO_PROXY"'], {
    NO_PROXY: 'example.com',
  });

  expect(text).toBe('broker-placeholder example.com,127.0.0.1,localhost\n');
});

test('it carries framed messages both ways on a spawn stream', async () => {
  const ctx = await setupProcessAdapter();
  const sandbox = await ctx.createSandbox(workerSpec);
  const stream = await sandbox.spawn({ argv: ['cat'], maxMessageBytes: 1024 });

  await stream.send(encoder.encode('first'));
  await stream.send(encoder.encode('second'));

  const first = await readNextMessage(stream);
  const second = await readNextMessage(stream);

  await stream.stop();

  expect([first, second]).toStrictEqual(['first', 'second']);
});

test('it ends a spawn stream whose message passes the caller limit', async () => {
  const ctx = await setupProcessAdapter();
  const sandbox = await ctx.createSandbox(workerSpec);
  const stream = await sandbox.spawn({ argv: ['cat'], maxMessageBytes: 4 });

  await stream.send(encoder.encode('too long'));

  expect(stream.messages[Symbol.asyncIterator]().next()).rejects.toThrow(
    'a frame of 8 bytes is past the limit of 4 bytes per message',
  );

  const exit = await stream.exit;

  expect(exit).toMatchObject({ code: null, signal: 'SIGTERM' });
});

test('a stop sends SIGTERM and kills the whole group 5 s later', async () => {
  const ctx = await setupProcessAdapter();
  const sandbox = await ctx.createSandbox(workerSpec);
  const stream = await sandbox.spawn({
    argv: ['sh', '-c', 'trap "" TERM; sleep 60 & echo $! > child.pid; wait'],
    maxMessageBytes: 1024,
  });
  const childPID = await waitForChildPID(sandbox);
  const startedAt = performance.now();
  const exit = await stream.stop();
  const elapsed = performance.now() - startedAt;

  expect(exit.signal).toBe('SIGKILL');
  expect(elapsed).toBeWithin(5000, 6500);
  expect(() => process.kill(childPID, 0)).toThrow();
}, 10_000);

async function waitForChildPID(sandbox: Sandbox): Promise<number> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    // oxlint-disable-next-line no-await-in-loop -- polls for the guest's file
    const text = await runText(sandbox, ['sh', '-c', 'cat child.pid 2>/dev/null']);

    if (text.trim() !== '') {
      return Number(text.trim());
    }

    // oxlint-disable-next-line no-await-in-loop -- polls for the guest's file
    await Bun.sleep(10);
  }
  throw new Error('the guest wrote no child.pid');
}

test('a stop returns at once when the group ends on SIGTERM', async () => {
  const ctx = await setupProcessAdapter();
  const sandbox = await ctx.createSandbox(workerSpec);
  const stream = await sandbox.spawn({ argv: ['sleep', '60'], maxMessageBytes: 1024 });
  const startedAt = performance.now();
  const exit = await stream.stop();

  expect(exit.signal).toBe('SIGTERM');
  expect(performance.now() - startedAt).toBeLessThan(1000);
});

test('an aborted exec stops its command', async () => {
  const ctx = await setupProcessAdapter();
  const sandbox = await ctx.createSandbox(workerSpec);
  const result = await sandbox.exec({ argv: ['sleep', '60'] }, AbortSignal.timeout(50));

  expect(result).toMatchObject({ code: null, signal: 'SIGTERM' });
});

const fetchScript =
  'const r = await fetch(process.env.TOOL_URL + "/mcp", { headers: { authorization: "Bearer run-token" } }); console.log(await r.text())';

test('the guest reaches the tool endpoint through its local tool route', async () => {
  const ctx = await setupProcessAdapter();
  const sandbox = await ctx.createSandbox(workerSpec);
  const route = await sandbox.toolRoute();
  const text = await runText(sandbox, [process.execPath, '-e', fetchScript], {
    TOOL_URL: route?.url ?? '',
  });

  expect(route?.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
  expect(JSON.parse(text)).toStrictEqual({ path: '/mcp', authorization: 'Bearer run-token' });
});

test('a sandbox without the tool route has none', async () => {
  const ctx = await setupProcessAdapter();
  const sandbox = await ctx.createSandbox({
    ...workerSpec,
    kind: 'code_run',
    grants: [],
    toolRoute: false,
  });

  expect(sandbox.toolRoute()).resolves.toBeNull();
});

test('it copies files in and out, and refuses a path that leaves the sandbox', async () => {
  const ctx = await setupProcessAdapter();
  const sandbox = await ctx.createSandbox(workerSpec);

  await sandbox.copyIn([{ path: '/work/in.txt', content: encoder.encode('hello') }]);
  await sandbox.exec({ argv: ['sh', '-c', 'tr a-z A-Z < in.txt > out.txt'], cwd: '/work' });

  const [out] = await sandbox.copyOut(['/work/out.txt']);

  expect(decoder.decode(out?.content)).toBe('HELLO');
  expect(sandbox.copyIn([{ path: '/../escape.txt', content: new Uint8Array() }])).rejects.toThrow(
    'a guest path must stay inside the sandbox: /../escape.txt',
  );
});

test('a sleep pauses the processes, and the wake resumes them', async () => {
  const ctx = await setupProcessAdapter();
  const sandbox = await ctx.createSandbox(workerSpec);
  const stream = await sandbox.spawn({ argv: ['cat'], maxMessageBytes: 1024 });

  const suspension = getMemorySuspension(sandbox);

  await suspension.sleep();

  expect(sandbox.exec({ argv: ['true'] })).rejects.toThrow(`sandbox ${sandbox.id} is asleep`);

  await suspension.wake();
  await stream.send(encoder.encode('x'));

  expect(readNextMessage(stream)).resolves.toBe('x');
});
