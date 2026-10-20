import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ToolTarget } from '@heynixie/sandbox';
import { SandboxSpecRefusedError } from '@heynixie/sandbox';
import {
  buildMockGrantSpec,
  buildMockSandboxSpec,
  setupTestRecorder,
  startStubToolEndpoint,
} from '@heynixie/sandbox/test-utils';
import invariant from 'tiny-invariant';
import { buildImpSandboxAdapter } from './build-imp-sandbox-adapter';
import type { PublicEgressConfig } from './parse-imp-config';
import { startFakeImp } from './test-utils/start-fake-imp';

interface AdapterConfig {
  readonly publicEgress?: PublicEgressConfig | null;
  readonly toolTarget?: ToolTarget;
}

// The imp adapter on a fresh recorder and a fake impd, with the stub tool endpoint on a unix socket
// in a scratch directory. buildAdapter makes another adapter on the same three, as a restart does.
async function setupTest() {
  const recorder = await setupTestRecorder();
  const imp = await startFakeImp();
  const directory = await mkdtemp(join(tmpdir(), 'nixie-sandbox-imp-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  startStubToolEndpoint(join(directory, 'tools.sock'));

  const buildAdapter = (config: AdapterConfig = {}) =>
    buildImpSandboxAdapter({
      port: imp.port,
      recorder: recorder.recorder,
      config: { publicEgress: config.publicEgress ?? null },
      toolTarget: () => config.toolTarget ?? { path: join(directory, 'tools.sock') },
      guestToolPort: imp.guestToolPort,
    });

  return {
    imp,
    directory,
    adapter: buildAdapter(),
    buildAdapter,
    recorder: recorder.recorder,
    readSandboxRecords: recorder.readSandboxRecords,
  };
}

test('it records every create, grant, sleep, wake and destroy', async () => {
  const ctx = await setupTest();

  const grant = buildMockGrantSpec();

  ctx.imp.secrets.set(grant.secret, [grant.host]);

  const sandbox = await ctx.adapter.create(
    buildMockSandboxSpec({ kind: 'conversation', grants: [grant] }),
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

test('it closes the forward for a sleep and opens it again after the wake', async () => {
  const ctx = await setupTest();

  const grant = buildMockGrantSpec();

  ctx.imp.secrets.set(grant.secret, [grant.host]);

  const sandbox = await ctx.adapter.create(
    buildMockSandboxSpec({ kind: 'conversation', grants: [grant] }),
  );

  invariant(sandbox.suspension.kind === 'memory');

  await sandbox.suspension.sleep();
  await sandbox.suspension.wake();
  await sandbox.destroy();

  expect(ctx.imp.calls).toStrictEqual([
    `create ${sandbox.id}`,
    `grant ${sandbox.id} ${grant.secret}`,
    `wake ${sandbox.id}`,
    `forward ${sandbox.id} ${ctx.imp.guestToolPort}`,
    `forward-stopped ${sandbox.id}`,
    `sleep ${sandbox.id}`,
    `wake ${sandbox.id}`,
    `forward ${sandbox.id} ${ctx.imp.guestToolPort}`,
    `forward-stopped ${sandbox.id}`,
    `remove ${sandbox.id}`,
  ]);
});

test('it lists every sandbox of the owner until it is destroyed', async () => {
  const ctx = await setupTest();
  const first = await ctx.adapter.create(buildMockSandboxSpec({ owner: 'conversation:step-7' }));

  // the fake impd forwards every imp's tool route from one local port, so one imp holds a route
  const second = await ctx.adapter.create(
    buildMockSandboxSpec({ owner: 'conversation:step-7', kind: 'code_run', toolRoute: false }),
  );

  const before = await ctx.adapter.list('conversation:step-7');

  await first.destroy();

  const after = await ctx.adapter.list('conversation:step-7');

  expect(before.map((sandbox) => sandbox.id)).toStrictEqual([first.id, second.id]);
  expect(after.map((sandbox) => sandbox.id)).toStrictEqual([second.id]);
});

test('it creates the imp with policy none, out of every backup, and leaves the grant to the broker', async () => {
  const ctx = await setupTest();

  const grant = buildMockGrantSpec();

  ctx.imp.secrets.set(grant.secret, [grant.host]);

  const sandbox = await ctx.adapter.create(
    buildMockSandboxSpec({
      kind: 'conversation',
      image: 'conversation',
      grants: [grant],
      limits: { vcpus: 2, memoryMiB: 2048, diskMiB: 4096 },
    }),
  );

  expect(ctx.imp.created).toStrictEqual([
    {
      name: sandbox.id,
      image: 'conversation',
      vcpus: 2,
      memoryMib: 2048,
      diskMib: 4096,
      policy: { mode: 'none', allow: [] },
      backup: false,
    },
  ]);
});

test('it refuses a sandbox on an impd that would back it up', async () => {
  const ctx = await setupTest();

  ctx.imp.features = { publicEgress: true, isEgressEnforced: true, hasBackupOptOut: false };

  expect(ctx.adapter.create(buildMockSandboxSpec({ grants: [] }))).rejects.toThrow(
    new SandboxSpecRefusedError('a sandbox on an impd that would back it up'),
  );

  expect(ctx.imp.calls).toStrictEqual([]);
});

test('it lists a sandbox whose imp impd still backs up as retired', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.adapter.create(buildMockSandboxSpec({ grants: [] }));

  const created = ctx.imp.created.at(0);

  invariant(created);

  // an imp made before the opt-out, which impd backs up for its life
  ctx.imp.created[0] = { ...created, backup: true };

  const listed = await ctx.adapter.list(sandbox.spec.owner);

  expect(listed.map((row) => [row.id, row.isRetired])).toStrictEqual([[sandbox.id, true]]);
});

test('it lists a sandbox whose imp stays out of the backups as kept', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.adapter.create(buildMockSandboxSpec({ grants: [] }));
  const listed = await ctx.adapter.list(sandbox.spec.owner);

  expect(listed.map((row) => [row.id, row.isRetired])).toStrictEqual([[sandbox.id, false]]);
});

test('it gets a sandbox whose imp impd still backs up as retired', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.adapter.create(buildMockSandboxSpec({ grants: [] }));

  const created = ctx.imp.created.at(0);

  invariant(created);

  ctx.imp.created[0] = { ...created, backup: true };

  const found = await ctx.adapter.get(sandbox.id);

  expect(found?.isRetired).toBeTrue();
});

test.each([
  ['public egress with a grant', 'fetch', { kind: 'public' }],
  ['public egress with a grant', 'coding', { kind: 'public' }],
  [
    'a grant with egress outside a coding session (conversation)',
    'conversation',
    { kind: 'allow', hosts: ['github.com'] },
  ],
  [
    'a grant with egress outside a coding session (worker)',
    'worker',
    { kind: 'allow', hosts: ['github.com'] },
  ],
] as const)(
  'it refuses %s for a %s sandbox and touches neither impd nor the log',
  async (reason, kind, egress) => {
    const ctx = await setupTest();

    const spec = buildMockSandboxSpec({ kind, egress, grants: [buildMockGrantSpec()] });

    expect(ctx.adapter.create(spec)).rejects.toThrow(new SandboxSpecRefusedError(reason));

    const records = await ctx.readSandboxRecords();

    expect(records).toStrictEqual([]);
    expect(ctx.imp.calls).toStrictEqual([]);
  },
);

test('it gives a coding session a box policy with its hosts beside its grant', async () => {
  const ctx = await setupTest();

  const grant = buildMockGrantSpec();

  ctx.imp.secrets.set(grant.secret, [grant.host]);

  await ctx.adapter.create(
    buildMockSandboxSpec({
      kind: 'coding',
      egress: { kind: 'allow', hosts: ['github.com', '*.npmjs.org'] },
      grants: [grant],
    }),
  );

  expect(ctx.imp.created.at(0)?.policy).toStrictEqual({
    mode: 'box',
    allow: ['github.com', '*.npmjs.org'],
  });
});

test('it makes a public imp with imp public policy', async () => {
  const ctx = await setupTest();

  const adapter = ctx.buildAdapter({
    publicEgress: { hostAddresses: ['203.0.113.7/24'], egressDeny: ['198.51.100.0/24'] },
  });

  await adapter.create(
    buildMockSandboxSpec({ kind: 'fetch', egress: { kind: 'public' }, grants: [] }),
  );

  expect(ctx.imp.created.at(0)?.policy).toStrictEqual({ mode: 'public', allow: [] });
});

test('it refuses public egress on an impd that does not enforce it', async () => {
  const ctx = await setupTest();

  const adapter = ctx.buildAdapter({
    publicEgress: { hostAddresses: ['203.0.113.7/24'], egressDeny: ['198.51.100.0/24'] },
  });

  ctx.imp.features = { publicEgress: true, isEgressEnforced: false, hasBackupOptOut: true };

  expect(
    adapter.create(buildMockSandboxSpec({ kind: 'fetch', egress: { kind: 'public' }, grants: [] })),
  ).rejects.toThrow(
    new SandboxSpecRefusedError('public egress on an impd that does not enforce it'),
  );
});

test('it refuses public egress without the deployment host addresses', async () => {
  const ctx = await setupTest();

  expect(
    ctx.adapter.create(
      buildMockSandboxSpec({ kind: 'fetch', egress: { kind: 'public' }, grants: [] }),
    ),
  ).rejects.toThrow(
    new SandboxSpecRefusedError('public egress without the host addresses in imp.host_addresses'),
  );
});

test('it refuses a grant whose secret covers another host beside its own', async () => {
  const ctx = await setupTest();

  ctx.imp.secrets.set('model-wide', ['api.anthropic.com', 'example.com']);

  const grant = buildMockGrantSpec({ secret: 'model-wide', host: 'api.anthropic.com' });

  expect(
    ctx.adapter.create(buildMockSandboxSpec({ kind: 'conversation', grants: [grant] })),
  ).rejects.toThrow(
    new SandboxSpecRefusedError(
      'grant model-wide must cover api.anthropic.com alone, and covers ["api.anthropic.com","example.com"]',
    ),
  );
});

test('it refuses a grant whose secret impd does not hold', async () => {
  const ctx = await setupTest();

  const grant = buildMockGrantSpec({ secret: 'missing', host: 'api.anthropic.com' });

  expect(
    ctx.adapter.create(buildMockSandboxSpec({ kind: 'conversation', grants: [grant] })),
  ).rejects.toThrow(
    new SandboxSpecRefusedError(
      'grant missing must cover api.anthropic.com alone, and covers null',
    ),
  );
});

test('it records a failed create as destroyed and removes the imp', async () => {
  const ctx = await setupTest();

  ctx.imp.failCreate = true;

  expect(
    ctx.adapter.create(buildMockSandboxSpec({ owner: 'conversation:step-7' })),
  ).rejects.toThrow('RAM_BUDGET_EXCEEDED');

  const records = await ctx.readSandboxRecords();
  const listed = await ctx.adapter.list('conversation:step-7');

  const id = records.at(0)?.payload['sandboxID'];

  invariant(typeof id === 'string');

  expect(records.map((record) => [record.kind, record.payload['reason'] ?? null])).toStrictEqual([
    ['sandbox.created', null],
    ['sandbox.destroyed', 'create_failed'],
  ]);

  expect(ctx.imp.calls).toStrictEqual([`create ${id}`, `remove ${id}`]);
  expect(listed).toStrictEqual([]);
});

test('it cuts exec output past 1 MiB, with the broker required and its NO_PROXY left alone', async () => {
  const ctx = await setupTest();

  const grant = buildMockGrantSpec({ env: { ANTHROPIC_API_KEY: 'broker-placeholder' } });

  ctx.imp.secrets.set(grant.secret, [grant.host]);

  const sandbox = await ctx.adapter.create(
    buildMockSandboxSpec({ kind: 'conversation', grants: [grant] }),
  );

  const result = await sandbox.exec({
    argv: ['sh', '-c', 'head -c 1572864 /dev/zero; echo "$ANTHROPIC_API_KEY $NO_PROXY" >&2'],
  });

  expect(result).toMatchObject({
    code: 0,
    stdout: { totalBytes: 1_572_864, isCut: true },
    stderr: { isCut: false },
  });

  expect(result.stdout.bytes.byteLength).toBe(1_048_576);

  expect(new TextDecoder().decode(result.stderr.bytes)).toBe(
    'broker-placeholder localhost,127.0.0.1,::1\n',
  );

  expect(ctx.imp.execs.at(0)?.options).toMatchObject({ killGraceMs: 5000, requireBroker: true });
});

test('it passes the command env alone to an exec in an imp with no grant, with no broker required', async () => {
  const ctx = await setupTest();

  const adapter = ctx.buildAdapter({
    publicEgress: { hostAddresses: ['203.0.113.7/24'], egressDeny: ['198.51.100.0/24'] },
  });

  const sandbox = await adapter.create(
    buildMockSandboxSpec({ kind: 'fetch', egress: { kind: 'public' }, grants: [] }),
  );

  await sandbox.exec({ argv: ['true'], env: { FOO: 'bar' } });

  expect(ctx.imp.execs.at(0)?.options).toMatchObject({ requireBroker: false });
  expect(ctx.imp.execs.at(0)?.options.env).toStrictEqual({ FOO: 'bar' });
});

test('it carries framed messages on a spawn stream, and a stop sends SIGTERM under the 5 s cgroup kill', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.adapter.create(buildMockSandboxSpec());
  const stream = await sandbox.spawn({ argv: ['cat'], maxMessageBytes: 64 });

  await stream.send(new TextEncoder().encode('hello'));

  const message = await stream.messages[Symbol.asyncIterator]().next();
  const exit = await stream.stop();

  expect(message).toStrictEqual({ done: false, value: new TextEncoder().encode('hello') });
  expect(exit.signal).toBe('SIGTERM');

  expect(ctx.imp.execs.at(0)).toMatchObject({
    argv: ['cat'],
    options: { killGraceMs: 5000 },
    signals: ['SIGTERM'],
  });
});

test('it lets the guest reach the tool endpoint through the reverse forward', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.adapter.create(buildMockSandboxSpec({ toolRoute: true }));
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

  expect(route).toStrictEqual({ url: `http://127.0.0.1:${ctx.imp.guestToolPort}` });

  expect(JSON.parse(new TextDecoder().decode(result.stdout.bytes))).toStrictEqual({
    path: '/mcp',
    authorization: 'Bearer run-token',
  });
});

test('it lets the guest reach the tool endpoint again after a sleep and a wake', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.adapter.create(buildMockSandboxSpec({ toolRoute: true }));
  const route = await sandbox.toolRoute();

  invariant(route);
  invariant(sandbox.suspension.kind === 'memory');

  await sandbox.suspension.sleep();
  await sandbox.suspension.wake();

  const result = await sandbox.exec({
    argv: [
      process.execPath,
      '-e',
      'const r = await fetch(process.env.TOOL_URL + "/mcp", { headers: { authorization: "Bearer run-token" } }); console.log(await r.text())',
    ],
    env: { TOOL_URL: route.url },
  });

  expect(JSON.parse(new TextDecoder().decode(result.stdout.bytes))).toStrictEqual({
    path: '/mcp',
    authorization: 'Bearer run-token',
  });
});

test('it copies a file in and back out through the guest', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.adapter.create(buildMockSandboxSpec());

  await sandbox.copyIn([
    { path: join(ctx.directory, 'work', 'in.txt'), content: new TextEncoder().encode('hello') },
  ]);

  const [out] = await sandbox.copyOut([join(ctx.directory, 'work', 'in.txt')]);

  expect(new TextDecoder().decode(out?.content)).toBe('hello');
});

test('it refuses to copy out a guest path that climbs', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.adapter.create(buildMockSandboxSpec());

  expect(sandbox.copyOut(['/tmp/../etc/passwd'])).rejects.toThrow(
    'a guest path must be absolute and must not climb: /tmp/../etc/passwd',
  );
});

test("it gives the command's HOME as both forms of the guest's home", async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.adapter.create(buildMockSandboxSpec());
  const home = await sandbox.resolveHome({ HOME: '/home/nixie' });

  expect(home).toStrictEqual({
    copyPath: '/home/nixie',
    ownPath: '/home/nixie',
  });
});

test('it refuses the home of a guest command with no HOME', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.adapter.create(buildMockSandboxSpec());

  expect(sandbox.resolveHome({})).rejects.toThrow('the guest command sets no HOME');
});

test('it refuses a HOME that is not an absolute guest path', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.adapter.create(buildMockSandboxSpec());

  expect(sandbox.resolveHome({ HOME: 'home/nixie' })).rejects.toThrow(
    'a guest path must be absolute and must not climb: home/nixie',
  );
});

test('it lists every file under a directory at any depth, relative to it, through the guest', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.adapter.create(buildMockSandboxSpec());

  await sandbox.copyIn([
    { path: join(ctx.directory, 'work/a.txt'), content: new TextEncoder().encode('a') },
    { path: join(ctx.directory, 'work/deep/b c.txt'), content: new TextEncoder().encode('b') },
    { path: join(ctx.directory, 'other/c.txt'), content: new TextEncoder().encode('c') },
  ]);

  const listed = await sandbox.readFilePaths(join(ctx.directory, 'work'));

  expect(listed).toIncludeSameMembers(['a.txt', 'deep/b c.txt']);
});

test('it lists no file deeper than the depth bound through the guest', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.adapter.create(buildMockSandboxSpec());

  await sandbox.copyIn([
    { path: join(ctx.directory, 'work/a.txt'), content: new TextEncoder().encode('a') },
    { path: join(ctx.directory, 'work/one/b.txt'), content: new TextEncoder().encode('b') },
    { path: join(ctx.directory, 'work/one/two/c.txt'), content: new TextEncoder().encode('c') },
  ]);

  const listed = await sandbox.readFilePaths(join(ctx.directory, 'work'), { maxDepth: 2 });

  expect(listed).toIncludeSameMembers(['a.txt', 'one/b.txt']);
});

test('it refuses a listing that passes the output cap, rather than return part of it', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.adapter.create(buildMockSandboxSpec());

  // 6000 names of about 200 bytes each list past the 1 MiB cap
  await sandbox.exec({
    argv: [
      'sh',
      '-c',
      'mkdir -p "$1" && cd "$1" && for i in $(seq 6000); do : > "$2$i"; done',
      'sh',
      join(ctx.directory, 'work'),
      'x'.repeat(200),
    ],
  });

  expect(sandbox.readFilePaths(join(ctx.directory, 'work'))).rejects.toThrow(
    `listing ${join(ctx.directory, 'work')} failed: the list passes 1048576 bytes`,
  );
});

test('it lists no file under a missing directory', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.adapter.create(buildMockSandboxSpec());
  const listed = await sandbox.readFilePaths(join(ctx.directory, 'missing'));

  expect(listed).toStrictEqual([]);
});

test('it moves a file over the one at the target through the guest, leaving none at the source', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.adapter.create(buildMockSandboxSpec());

  await sandbox.copyIn([
    { path: join(ctx.directory, 'work/new.txt'), content: new TextEncoder().encode('new') },
    { path: join(ctx.directory, 'work/old.txt'), content: new TextEncoder().encode('old') },
  ]);

  await sandbox.applyMove(join(ctx.directory, 'work/new.txt'), join(ctx.directory, 'work/old.txt'));

  const [moved] = await sandbox.copyOut([join(ctx.directory, 'work/old.txt')]);
  const listed = await sandbox.readFilePaths(join(ctx.directory, 'work'));

  expect(new TextDecoder().decode(moved?.content)).toBe('new');
  expect(listed).toStrictEqual(['old.txt']);
});

test('it refuses to move a file onto a directory, and keeps the file', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.adapter.create(buildMockSandboxSpec());

  await sandbox.copyIn([
    { path: join(ctx.directory, 'work/a.txt'), content: new TextEncoder().encode('a') },
    { path: join(ctx.directory, 'work/dir/b.txt'), content: new TextEncoder().encode('b') },
  ]);

  const failure = await sandbox
    .applyMove(join(ctx.directory, 'work/a.txt'), join(ctx.directory, 'work/dir'))
    .then(
      () => null,
      (error: unknown) => error,
    );

  expect(failure).toMatchObject({
    message: expect.toStartWith(
      `move of ${join(ctx.directory, 'work/a.txt')} to ${join(ctx.directory, 'work/dir')} failed with 1`,
    ),
  });

  const listed = await sandbox.readFilePaths(join(ctx.directory, 'work'));

  expect(listed).toIncludeSameMembers(['a.txt', 'dir/b.txt']);
});

test('it refuses to list a guest path that climbs', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.adapter.create(buildMockSandboxSpec());

  expect(sandbox.readFilePaths('/tmp/../etc')).rejects.toThrow(
    'a guest path must be absolute and must not climb: /tmp/../etc',
  );
});

test('it lets a restarted adapter list and destroy what the last one made, for recovery', async () => {
  const ctx = await setupTest();

  const spec = buildMockSandboxSpec({ owner: 'conversation:step-7' });

  const made = await ctx.adapter.create(spec);

  const restarted = ctx.buildAdapter();

  const [orphan] = await restarted.list('conversation:step-7');

  await orphan?.destroy();

  const found = await restarted.get(made.id);

  expect(orphan?.spec).toStrictEqual(spec);
  expect(found).toBeNull();
  expect(ctx.imp.calls.at(-1)).toBe(`remove ${made.id}`);
});

test('it rejects the exit of a session that impd loses after a stop', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.adapter.create(buildMockSandboxSpec());

  ctx.imp.failExitOnStop = true;

  const stream = await sandbox.spawn({ argv: ['sleep', '60'], maxMessageBytes: 64 });

  expect(stream.stop()).rejects.toThrow('CONNECTION_CLOSED');
});

test('it fails only the guest connection to a tool endpoint that is down', async () => {
  const ctx = await setupTest();

  const adapter = ctx.buildAdapter({ toolTarget: { path: join(ctx.directory, 'missing.sock') } });

  const sandbox = await adapter.create(buildMockSandboxSpec({ toolRoute: true }));
  const route = await sandbox.toolRoute();

  invariant(route);

  const result = await sandbox.exec({
    argv: [
      process.execPath,
      '-e',
      'await fetch(process.env.TOOL_URL).catch(() => console.log("failed"))',
    ],
    env: { TOOL_URL: route.url },
  });

  expect(new TextDecoder().decode(result.stdout.bytes)).toBe('failed\n');
});

test('it records the wake that a call on a sleeping imp causes', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.adapter.create(buildMockSandboxSpec({ owner: 'conversation:step-7' }));

  invariant(sandbox.suspension.kind === 'memory');

  await sandbox.suspension.sleep();
  await sandbox.exec({ argv: ['true'] });

  const records = await ctx.readSandboxRecords();
  const [row] = await ctx.recorder.list('imp', 'conversation:step-7');

  expect(records.map((record) => record.kind).slice(-2)).toStrictEqual([
    'sandbox.slept',
    'sandbox.woken',
  ]);

  expect(row?.state).toBe('awake');
});

test('it refuses to copy out a guest file past 64 MiB', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.adapter.create(buildMockSandboxSpec());

  expect(sandbox.copyOut(['/dev/zero'])).rejects.toThrow(
    'copy out of /dev/zero failed: the file passes 67108864 bytes',
  );
});

test.each([
  ['bearer', 'secret model-chat-1 gateway.example authorization bearer'],
  ['x-api-key', 'secret model-chat-1 gateway.example x-api-key raw'],
] as const)('it stores a %s secret for its one host', async (header, call) => {
  const ctx = await setupTest();

  await ctx.adapter.addSecret({
    name: 'model-chat-1',
    value: 'not-a-real-key',
    host: 'gateway.example',
    header,
  });

  expect(ctx.imp.calls).toStrictEqual([call]);
});

test('it stores no secret when one already has the name', async () => {
  const ctx = await setupTest();

  ctx.imp.secrets.set('model-default', ['api.anthropic.com']);

  await ctx.adapter.addSecret({
    name: 'model-default',
    value: 'not-a-real-key',
    host: 'api.anthropic.com',
    header: 'x-api-key',
  });

  expect(ctx.imp.calls).toStrictEqual([]);
});

test('it adds an image by its reference under its name', async () => {
  const ctx = await setupTest();

  await ctx.adapter.addImage({
    name: 'nixie-fetch-aaaaaaaaaaaa',
    ref: `ghcr.io/example/nixie-fetch@sha256:${'a'.repeat(64)}`,
  });

  expect(ctx.imp.calls).toStrictEqual([
    `image nixie-fetch-aaaaaaaaaaaa ghcr.io/example/nixie-fetch@sha256:${'a'.repeat(64)}`,
  ]);
});

test('it adds nothing when impd holds the name at the same digest', async () => {
  const ctx = await setupTest();

  ctx.imp.images.set('nixie-fetch-aaaaaaaaaaaa', {
    digest: `sha256:${'a'.repeat(64)}`,
    ref: 'ghcr.io/example/nixie-fetch:0.1.0',
  });

  await ctx.adapter.addImage({
    name: 'nixie-fetch-aaaaaaaaaaaa',
    ref: `ghcr.io/example/nixie-fetch@sha256:${'a'.repeat(64)}`,
  });

  expect(ctx.imp.calls).toStrictEqual([]);
});

test('it adds nothing when impd built the name from a reference pinned at the same digest', async () => {
  const ctx = await setupTest();

  ctx.imp.images.set('nixie-fetch-aaaaaaaaaaaa', {
    digest: `imp-build-${'c'.repeat(64)}`,
    ref: `ghcr.io/example/nixie-fetch@sha256:${'a'.repeat(64)}`,
  });

  await ctx.adapter.addImage({
    name: 'nixie-fetch-aaaaaaaaaaaa',
    ref: `ghcr.io/example/nixie-fetch@sha256:${'a'.repeat(64)}`,
  });

  expect(ctx.imp.calls).toStrictEqual([]);
});

test('it adds nothing, and succeeds, when impd holds the name and would refuse an add', async () => {
  const ctx = await setupTest();

  ctx.imp.refuseImageAdd = true;

  ctx.imp.images.set('nixie-fetch-aaaaaaaaaaaa', {
    digest: `sha256:${'a'.repeat(64)}`,
    ref: `ghcr.io/example/nixie-fetch@sha256:${'a'.repeat(64)}`,
  });

  await expect(
    ctx.adapter.addImage({
      name: 'nixie-fetch-aaaaaaaaaaaa',
      ref: `ghcr.io/example/nixie-fetch@sha256:${'a'.repeat(64)}`,
    }),
  ).toResolve();

  expect(ctx.imp.calls).toStrictEqual([]);
});

test('it names the image and its reference when impd refuses the add', async () => {
  const ctx = await setupTest();

  ctx.imp.refuseImageAdd = true;

  expect(
    ctx.adapter.addImage({
      name: 'nixie-fetch-aaaaaaaaaaaa',
      ref: `ghcr.io/example/nixie-fetch@sha256:${'a'.repeat(64)}`,
    }),
  ).rejects.toThrowWithMessage(
    Error,
    /^impd did not add the image nixie-fetch-aaaaaaaaaaaa from ghcr\.io\/example\/nixie-fetch@sha256:a{64}: token nixie-test is limited to some imps; this call is host-wide$/u,
  );
});

test('it refuses an image whose name impd holds at another digest', async () => {
  const ctx = await setupTest();

  ctx.imp.images.set('nixie-fetch-aaaaaaaaaaaa', {
    digest: `sha256:${'b'.repeat(64)}`,
    ref: `ghcr.io/example/nixie-fetch@sha256:${'b'.repeat(64)}`,
  });

  expect(
    ctx.adapter.addImage({
      name: 'nixie-fetch-aaaaaaaaaaaa',
      ref: `ghcr.io/example/nixie-fetch@sha256:${'a'.repeat(64)}`,
    }),
  ).rejects.toThrowWithMessage(Error, /impd holds the image nixie-fetch-aaaaaaaaaaaa at sha256:b/u);
});

test('it refuses an image impd built from a reference pinned at another digest', async () => {
  const ctx = await setupTest();

  ctx.imp.images.set('nixie-fetch-aaaaaaaaaaaa', {
    digest: `imp-build-${'c'.repeat(64)}`,
    ref: `ghcr.io/example/nixie-fetch@sha256:${'b'.repeat(64)}`,
  });

  expect(
    ctx.adapter.addImage({
      name: 'nixie-fetch-aaaaaaaaaaaa',
      ref: `ghcr.io/example/nixie-fetch@sha256:${'a'.repeat(64)}`,
    }),
  ).rejects.toThrowWithMessage(
    Error,
    /impd holds the image nixie-fetch-aaaaaaaaaaaa at imp-build-c+ from ghcr\.io\/example\/nixie-fetch@sha256:b+, not sha256:a+$/u,
  );
});

test('it refuses an image impd built from a reference with no digest', async () => {
  const ctx = await setupTest();

  ctx.imp.images.set('nixie-fetch-aaaaaaaaaaaa', {
    digest: `imp-build-${'c'.repeat(64)}`,
    ref: 'ghcr.io/example/nixie-fetch:0.1.0',
  });

  expect(
    ctx.adapter.addImage({
      name: 'nixie-fetch-aaaaaaaaaaaa',
      ref: `ghcr.io/example/nixie-fetch@sha256:${'a'.repeat(64)}`,
    }),
  ).rejects.toThrowWithMessage(
    Error,
    /at imp-build-c+ from ghcr\.io\/example\/nixie-fetch:0\.1\.0/u,
  );
});

test('it refuses an image reference with no digest', async () => {
  const ctx = await setupTest();

  expect(
    ctx.adapter.addImage({ name: 'nixie-fetch', ref: 'ghcr.io/example/nixie-fetch:0.1.0' }),
  ).rejects.toThrowWithMessage(Error, /is not pinned by digest/u);
});

test('it reports the runtime ready while impd answers', async () => {
  const ctx = await setupTest();
  const report = await ctx.adapter.checkRuntime();

  expect(report).toStrictEqual({ isReady: true, reason: null });
});

test('it reports the runtime unready when impd does not answer', async () => {
  const ctx = await setupTest();

  ctx.imp.failFeatures = true;

  const report = await ctx.adapter.checkRuntime();

  expect(report).toStrictEqual({ isReady: false, reason: 'impd does not answer' });
});
