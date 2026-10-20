import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { createProcessSandboxAdapter } from './create-process-sandbox-adapter';
import { SandboxSpecRefusedError } from './sandbox-spec-refused-error';
import { buildMockGrantSpec } from './test-utils/build-mock-grant-spec';
import { buildMockSandboxSpec } from './test-utils/build-mock-sandbox-spec';
import { setupTestRecorder } from './test-utils/setup-test-recorder';
import { startStubToolEndpoint } from './test-utils/start-stub-tool-endpoint';
import type { Sandbox, SandboxAdapter, SandboxSpec } from './types';

interface SetupConfig {
  // the stop's kill deadline, when a test needs one shorter than the default
  readonly killGraceMs?: number;
}

// The process adapter on a fresh recorder, with the stub tool endpoint in its root. The stack's hook
// registers before the recorder's, and hooks run first in, first out, so each sandbox that
// createSandbox made writes its destroy record before the writer stops.
async function setupTest(config: SetupConfig = {}) {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const recorder = await setupTestRecorder();
  const rootDir = await mkdtemp(join(tmpdir(), 'nixie-sandbox-process-'));

  stack.defer(() => rm(rootDir, { recursive: true, force: true }));

  startStubToolEndpoint(join(rootDir, 'tools.sock'));

  // a test that needs the host's environment passes it here, as the server passes its own
  const createAdapter = (hostEnv: Readonly<Record<string, string>> = {}) =>
    createProcessSandboxAdapter({
      recorder: recorder.recorder,
      rootDir,
      toolTarget: () => ({ path: join(rootDir, 'tools.sock') }),
      hostEnv,
      ...(config.killGraceMs === undefined ? {} : { killGraceMs: config.killGraceMs }),
    });

  const adapter = createAdapter();

  const createSandbox = async (
    spec: SandboxSpec,
    on: SandboxAdapter = adapter,
  ): Promise<Sandbox> => {
    const sandbox = await on.create(spec);

    stack.defer(() => sandbox.destroy());

    return sandbox;
  };

  return {
    adapter,
    rootDir,
    createAdapter,
    createSandbox,
    recorder: recorder.recorder,
    readSandboxRecords: recorder.readSandboxRecords,
  };
}

test('it records every create, grant, sleep, wake and destroy', async () => {
  const ctx = await setupTest();

  const sandbox = await ctx.adapter.create(
    buildMockSandboxSpec({ grants: [buildMockGrantSpec()] }),
  );

  invariant(sandbox.suspension.kind === 'memory');

  await sandbox.suspension.sleep();
  await sandbox.suspension.wake();
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

test('it lists every sandbox of the owner until it is destroyed', async () => {
  const ctx = await setupTest();
  const first = await ctx.createSandbox(buildMockSandboxSpec({ owner: 'task-1:step-2' }));
  const second = await ctx.createSandbox(buildMockSandboxSpec({ owner: 'task-1:step-2' }));

  await ctx.createSandbox(buildMockSandboxSpec({ owner: 'task-9:step-1' }));

  const before = await ctx.adapter.list('task-1:step-2');

  await first.destroy();

  const after = await ctx.adapter.list('task-1:step-2');

  expect(before.map((sandbox) => sandbox.id)).toStrictEqual([first.id, second.id]);
  expect(after.map((sandbox) => sandbox.id)).toStrictEqual([second.id]);
});

test('it lets a restarted adapter list and destroy what the last one made', async () => {
  const ctx = await setupTest();
  const made = await ctx.adapter.create(buildMockSandboxSpec({ owner: 'task-1:step-2' }));

  const restarted = ctx.createAdapter();

  const [orphan] = await restarted.list('task-1:step-2');

  await orphan?.destroy();

  const found = await restarted.read(made.id);
  const hasDirectory = await Bun.file(join(ctx.rootDir, made.id, 'fs')).exists();

  expect(orphan?.id).toBe(made.id);
  expect(found).toBeNull();
  expect(hasDirectory).toBeFalse();
});

test.each([
  ['public egress with a grant', 'fetch', { kind: 'public' }],
  [
    'a grant with egress outside a coding session (worker)',
    'worker',
    { kind: 'allow', hosts: ['github.com'] },
  ],
] as const)('it refuses a spec with %s and writes no record', async (reason, kind, egress) => {
  const ctx = await setupTest();

  const spec = buildMockSandboxSpec({ kind, egress, grants: [buildMockGrantSpec()] });

  expect(ctx.adapter.create(spec)).rejects.toThrow(new SandboxSpecRefusedError(reason));

  const records = await ctx.readSandboxRecords();

  expect(records).toStrictEqual([]);
});

test("it fails the create of a disk smaller than a built image's filesystem", async () => {
  const ctx = await setupTest();

  const spec = buildMockSandboxSpec({ limits: { diskMiB: 4095 } });

  expect(ctx.adapter.create(spec)).rejects.toThrow(
    new Error("a disk of 4095 MiB is smaller than the image's filesystem (4096 MiB)"),
  );

  const records = await ctx.readSandboxRecords();

  expect(records).toMatchObject([
    { kind: 'sandbox.created' },
    { kind: 'sandbox.destroyed', payload: { reason: 'create_failed' } },
  ]);
});

test('it cuts exec output past 1 MiB per stream', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.createSandbox(buildMockSandboxSpec());

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
  const ctx = await setupTest();

  const sandbox = await ctx.createSandbox(
    buildMockSandboxSpec({
      grants: [buildMockGrantSpec({ env: { ANTHROPIC_API_KEY: 'broker-placeholder' } })],
    }),
  );

  const result = await sandbox.exec({
    argv: ['sh', '-c', 'echo "$ANTHROPIC_API_KEY $NO_PROXY"'],
    env: { NO_PROXY: 'example.com' },
  });

  expect(new TextDecoder().decode(result.stdout.bytes)).toBe(
    'broker-placeholder example.com,127.0.0.1,localhost\n',
  );
});

test("it passes the host's broker variables to a guest with a grant", async () => {
  const ctx = await setupTest();

  const adapter = ctx.createAdapter({
    HTTPS_PROXY: 'http://10.0.0.5:7081',
    NODE_EXTRA_CA_CERTS: '/etc/broker/ca.pem',
    NO_PROXY: 'internal.example',
    TOKEN: 'host-only',
  });

  const sandbox = await ctx.createSandbox(
    buildMockSandboxSpec({
      grants: [buildMockGrantSpec({ env: { ANTHROPIC_API_KEY: 'broker-placeholder' } })],
    }),
    adapter,
  );

  const result = await sandbox.exec({
    argv: ['sh', '-c', 'echo "$HTTPS_PROXY $NODE_EXTRA_CA_CERTS $NO_PROXY [$TOKEN]"'],
  });

  expect(new TextDecoder().decode(result.stdout.bytes)).toBe(
    'http://10.0.0.5:7081 /etc/broker/ca.pem internal.example,127.0.0.1,localhost []\n',
  );
});

test('it passes no broker variable to a guest without a grant', async () => {
  const ctx = await setupTest();

  const adapter = ctx.createAdapter({ HTTPS_PROXY: 'http://10.0.0.5:7081' });

  const sandbox = await ctx.createSandbox(buildMockSandboxSpec({ grants: [] }), adapter);
  const result = await sandbox.exec({ argv: ['sh', '-c', 'echo "[$HTTPS_PROXY]"'] });

  expect(new TextDecoder().decode(result.stdout.bytes)).toBe('[]\n');
});

test('it carries framed messages both ways on a spawn stream', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.createSandbox(buildMockSandboxSpec());
  const stream = await sandbox.spawn({ argv: ['cat'], maxMessageBytes: 1024 });

  const messages = stream.messages[Symbol.asyncIterator]();

  await stream.send(new TextEncoder().encode('first'));
  await stream.send(new TextEncoder().encode('second'));

  const first = await messages.next();
  const second = await messages.next();

  expect(first).toStrictEqual({ done: false, value: new TextEncoder().encode('first') });
  expect(second).toStrictEqual({ done: false, value: new TextEncoder().encode('second') });
});

test('it ends a spawn stream whose message passes the caller limit', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.createSandbox(buildMockSandboxSpec());
  const stream = await sandbox.spawn({ argv: ['cat'], maxMessageBytes: 4 });

  await stream.send(new TextEncoder().encode('too long'));

  expect(stream.messages[Symbol.asyncIterator]().next()).rejects.toThrow(
    'a frame of 8 bytes is past the limit of 4 bytes per message',
  );

  expect(stream.exit).resolves.toMatchObject({ code: null, signal: 'SIGTERM' });
});

test('it kills the whole group when SIGTERM leaves it running', async () => {
  const ctx = await setupTest({ killGraceMs: 300 });
  const sandbox = await ctx.createSandbox(buildMockSandboxSpec());

  // the child starts with SIGTERM ignored; the shell then traps it, notes it in term.txt, and goes
  // on waiting, so only the kill ends the group; ready.txt shows both traps are set
  const stream = await sandbox.spawn({
    argv: [
      'sh',
      '-c',
      'trap "" TERM; sleep 60 & echo $! > child.pid; trap "echo term > term.txt" TERM; echo ready > ready.txt; while :; do wait; done',
    ],
    maxMessageBytes: 1024,
  });

  await waitForCondition(() => Bun.file(join(ctx.rootDir, sandbox.id, 'fs', 'ready.txt')).exists());

  const exit = await stream.stop();

  const after = await sandbox.exec({
    argv: [
      'sh',
      '-c',
      'cat term.txt; kill -0 "$(cat child.pid)" 2>/dev/null && echo alive || echo gone',
    ],
  });

  expect(exit.signal).toBe('SIGKILL');
  expect(new TextDecoder().decode(after.stdout.bytes)).toBe('term\ngone\n');
});

test('it holds the kill until the deadline when SIGTERM leaves the group running', async () => {
  const ctx = await setupTest({ killGraceMs: 300 });
  const sandbox = await ctx.createSandbox(buildMockSandboxSpec());

  const stream = await sandbox.spawn({
    argv: ['sh', '-c', 'trap "" TERM; echo started > started.txt; while :; do sleep 1; done'],
    maxMessageBytes: 1024,
  });

  await waitForCondition(() =>
    Bun.file(join(ctx.rootDir, sandbox.id, 'fs', 'started.txt')).exists(),
  );

  const startedAt = performance.now();

  await stream.stop();

  const elapsed = performance.now() - startedAt;

  expect(elapsed).toBeWithin(300, 2000);
});

test('it returns a stop at once when the group ends on SIGTERM', async () => {
  const ctx = await setupTest({ killGraceMs: 30_000 });
  const sandbox = await ctx.createSandbox(buildMockSandboxSpec());
  const stream = await sandbox.spawn({ argv: ['sleep', '60'], maxMessageBytes: 1024 });

  const startedAt = performance.now();

  const exit = await stream.stop();

  const elapsed = performance.now() - startedAt;

  expect(exit.signal).toBe('SIGTERM');
  expect(elapsed).toBeLessThan(1000);
});

test('it stops the command of an aborted exec', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.createSandbox(buildMockSandboxSpec());
  const result = await sandbox.exec({ argv: ['sleep', '60'] }, AbortSignal.timeout(50));

  expect(result).toMatchObject({ code: null, signal: 'SIGTERM' });
});

test('it lets the guest reach the tool endpoint through its local tool route', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.createSandbox(buildMockSandboxSpec({ toolRoute: true }));
  const route = await sandbox.toolRoute();

  invariant(route);

  const result = await sandbox.exec({
    argv: [
      process.execPath,
      '-e',
      'const r = await fetch(process.env.TOOL_URL + "/mcp", { headers: { authorization: "Bearer run-token" } }); console.log(await r.text())',
    ],
    env: { TOOL_URL: route.url },
  });

  expect(route.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);

  expect(JSON.parse(new TextDecoder().decode(result.stdout.bytes))).toStrictEqual({
    path: '/mcp',
    authorization: 'Bearer run-token',
  });
});

test('it gives a sandbox without the tool route no route', async () => {
  const ctx = await setupTest();

  const sandbox = await ctx.createSandbox(
    buildMockSandboxSpec({ kind: 'code_run', grants: [], toolRoute: false }),
  );

  expect(sandbox.toolRoute()).resolves.toBeNull();
});

test('it copies a file in, and back out after the guest changed it', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.createSandbox(buildMockSandboxSpec());

  await sandbox.copyIn([{ path: '/work/in.txt', content: new TextEncoder().encode('hello') }]);
  await sandbox.exec({ argv: ['sh', '-c', 'tr a-z A-Z < in.txt > out.txt'], cwd: '/work' });

  const [out] = await sandbox.copyOut(['/work/out.txt']);

  expect(new TextDecoder().decode(out?.content)).toBe('HELLO');
});

test('it refuses to copy in a path that leaves the sandbox', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.createSandbox(buildMockSandboxSpec());

  expect(sandbox.copyIn([{ path: '/../escape.txt', content: new Uint8Array() }])).rejects.toThrow(
    'a guest path must stay inside the sandbox: /../escape.txt',
  );
});

test('it refuses to copy in a relative path', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.createSandbox(buildMockSandboxSpec());

  expect(sandbox.copyIn([{ path: 'work/in.txt', content: new Uint8Array() }])).rejects.toThrow(
    'a guest path must be absolute: work/in.txt',
  );
});

test("it gives the sandbox's own directory as the home of a guest whose command sets no HOME", async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.createSandbox(buildMockSandboxSpec());
  const home = await sandbox.resolveHome({});

  expect(home).toStrictEqual({
    copyPath: '/',
    ownPath: join(ctx.rootDir, sandbox.id, 'fs'),
  });
});

test('it gives the home under the real path of a root reached through a symlink', async () => {
  const ctx = await setupTest();
  const linkDir = await mkdtemp(join(tmpdir(), 'nixie-sandbox-link-'));

  onTestFinished(() => rm(linkDir, { recursive: true, force: true }));

  await symlink(ctx.rootDir, join(linkDir, 'root'));

  const linked = createProcessSandboxAdapter({
    recorder: ctx.recorder,
    rootDir: join(linkDir, 'root'),
    toolTarget: () => ({ path: join(ctx.rootDir, 'tools.sock') }),
  });

  const sandbox = await ctx.createSandbox(buildMockSandboxSpec(), linked);
  const home = await sandbox.resolveHome({});
  const realRoot = await realpath(ctx.rootDir);

  expect(home).toStrictEqual({ copyPath: '/', ownPath: join(realRoot, sandbox.id, 'fs') });
});

test('it gives a HOME named through the symlink of the root under the real path, before the HOME exists', async () => {
  const ctx = await setupTest();
  const linkDir = await mkdtemp(join(tmpdir(), 'nixie-sandbox-link-'));

  onTestFinished(() => rm(linkDir, { recursive: true, force: true }));

  await symlink(ctx.rootDir, join(linkDir, 'root'));

  const linked = createProcessSandboxAdapter({
    recorder: ctx.recorder,
    rootDir: join(linkDir, 'root'),
    toolTarget: () => ({ path: join(ctx.rootDir, 'tools.sock') }),
  });

  const sandbox = await ctx.createSandbox(buildMockSandboxSpec(), linked);

  const home = await sandbox.resolveHome({
    HOME: join(linkDir, 'root', sandbox.id, 'fs/home/nixie'),
  });

  const realRoot = await realpath(ctx.rootDir);

  expect(home).toStrictEqual({
    copyPath: '/home/nixie',
    ownPath: join(realRoot, sandbox.id, 'fs/home/nixie'),
  });
});

test("it refuses a HOME named through the symlink of the root but outside the sandbox's directory", async () => {
  const ctx = await setupTest();
  const linkDir = await mkdtemp(join(tmpdir(), 'nixie-sandbox-link-'));

  onTestFinished(() => rm(linkDir, { recursive: true, force: true }));

  await symlink(ctx.rootDir, join(linkDir, 'root'));

  const linked = createProcessSandboxAdapter({
    recorder: ctx.recorder,
    rootDir: join(linkDir, 'root'),
    toolTarget: () => ({ path: join(ctx.rootDir, 'tools.sock') }),
  });

  const sandbox = await ctx.createSandbox(buildMockSandboxSpec(), linked);
  const realRoot = await realpath(ctx.rootDir);

  expect(sandbox.resolveHome({ HOME: join(linkDir, 'root', 'other/fs') })).rejects.toThrow(
    `HOME ${join(linkDir, 'root', 'other/fs')} is outside the guest root ${join(realRoot, sandbox.id, 'fs')}`,
  );
});

test("it gives the command's HOME as the guest sees it, and as the path below the sandbox's directory", async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.createSandbox(buildMockSandboxSpec());

  const home = join(ctx.rootDir, sandbox.id, 'fs/home/nixie');

  const resolved = await sandbox.resolveHome({ HOME: home });

  expect(resolved).toStrictEqual({
    copyPath: '/home/nixie',
    ownPath: home,
  });
});

test("it refuses a HOME outside the sandbox's directory", async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.createSandbox(buildMockSandboxSpec());

  expect(sandbox.resolveHome({ HOME: ctx.rootDir })).rejects.toThrow(
    `HOME ${ctx.rootDir} is outside the guest root ${join(ctx.rootDir, sandbox.id, 'fs')}`,
  );
});

test('it lists every file under a directory at any depth, relative to it', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.createSandbox(buildMockSandboxSpec());

  await sandbox.copyIn([
    { path: '/work/a.txt', content: new TextEncoder().encode('a') },
    { path: '/work/deep/b.txt', content: new TextEncoder().encode('b') },
    { path: '/other/c.txt', content: new TextEncoder().encode('c') },
  ]);

  const listed = await sandbox.readFilePaths('/work');

  expect(listed).toIncludeSameMembers(['a.txt', 'deep/b.txt']);
});

test('it lists no file deeper than the depth bound', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.createSandbox(buildMockSandboxSpec());

  await sandbox.copyIn([
    { path: '/work/a.txt', content: new TextEncoder().encode('a') },
    { path: '/work/one/b.txt', content: new TextEncoder().encode('b') },
    { path: '/work/one/two/c.txt', content: new TextEncoder().encode('c') },
  ]);

  const listed = await sandbox.readFilePaths('/work', { maxDepth: 2 });

  expect(listed).toIncludeSameMembers(['a.txt', 'one/b.txt']);
});

test('it lists no file under a missing directory', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.createSandbox(buildMockSandboxSpec());
  const listed = await sandbox.readFilePaths('/missing');

  expect(listed).toStrictEqual([]);
});

test('it moves a file over the one at the target, leaving none at the source', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.createSandbox(buildMockSandboxSpec());

  await sandbox.copyIn([
    { path: '/work/new.txt', content: new TextEncoder().encode('new') },
    { path: '/work/old.txt', content: new TextEncoder().encode('old') },
  ]);

  await sandbox.applyMove('/work/new.txt', '/work/old.txt');

  const [moved] = await sandbox.copyOut(['/work/old.txt']);
  const listed = await sandbox.readFilePaths('/work');

  expect(new TextDecoder().decode(moved?.content)).toBe('new');
  expect(listed).toStrictEqual(['old.txt']);
});

test('it refuses to move a file onto a directory, and keeps the file', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.createSandbox(buildMockSandboxSpec());

  await sandbox.copyIn([
    { path: '/work/a.txt', content: new TextEncoder().encode('a') },
    { path: '/work/dir/b.txt', content: new TextEncoder().encode('b') },
  ]);

  const failure = await sandbox.applyMove('/work/a.txt', '/work/dir').then(
    () => null,
    (error: unknown) => error,
  );

  const listed = await sandbox.readFilePaths('/work');

  expect(failure).toMatchObject({ code: 'EISDIR' });
  expect(listed).toIncludeSameMembers(['a.txt', 'dir/b.txt']);
});

test('it refuses to move a file out of the sandbox', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.createSandbox(buildMockSandboxSpec());

  expect(sandbox.applyMove('/work/a.txt', '/../a.txt')).rejects.toThrow(
    'a guest path must stay inside the sandbox: /../a.txt',
  );
});

test('it refuses an exec while the sandbox sleeps', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.createSandbox(buildMockSandboxSpec());

  invariant(sandbox.suspension.kind === 'memory');

  await sandbox.suspension.sleep();

  expect(sandbox.exec({ argv: ['true'] })).rejects.toThrow(`sandbox ${sandbox.id} is asleep`);
});

test('it resumes a sleeping process on the wake', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.createSandbox(buildMockSandboxSpec());
  const stream = await sandbox.spawn({ argv: ['cat'], maxMessageBytes: 1024 });

  invariant(sandbox.suspension.kind === 'memory');

  await sandbox.suspension.sleep();
  await sandbox.suspension.wake();
  await stream.send(new TextEncoder().encode('x'));

  const message = await stream.messages[Symbol.asyncIterator]().next();

  expect(message).toStrictEqual({ done: false, value: new TextEncoder().encode('x') });
});

test('it reports the exit of an exec that stops reading stdin early', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.createSandbox(buildMockSandboxSpec());

  const result = await sandbox.exec({
    argv: ['head', '-c', '1'],
    stdin: new Uint8Array(4 * 1024 * 1024),
  });

  expect(result).toMatchObject({ code: 0, stdout: { totalBytes: 1 } });
});

test('it accepts a secret and records nothing, because the double injects no grant', async () => {
  const ctx = await setupTest();

  await ctx.adapter.addSecret({
    name: 'model-chat-1',
    value: 'not-a-real-key',
    host: 'api.anthropic.com',
    header: 'x-api-key',
  });

  const records = await ctx.readSandboxRecords();

  expect(records).toStrictEqual([]);
});
