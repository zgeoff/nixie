import { expect, test } from 'bun:test';
import { join } from 'node:path';
import type { ExecStream, GrantSpec, Sandbox, SandboxSpec } from '@heynixie/sandbox';
import { SandboxSpecRefusedError } from '@heynixie/sandbox';
import { setupImpAdapter } from './test-utils/setup-imp-adapter';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const modelGrant: GrantSpec = {
  secret: 'model-default',
  host: 'api.anthropic.com',
  env: { ANTHROPIC_API_KEY: 'broker-placeholder' },
};

const conversationSpec: SandboxSpec = {
  kind: 'conversation',
  image: 'conversation',
  owner: 'conversation:step-7',
  egress: { kind: 'none' },
  grants: [modelGrant],
  toolRoute: true,
  limits: { vcpus: 2, memoryMiB: 2048, diskMiB: 4096 },
};

const fetchSpec: SandboxSpec = {
  ...conversationSpec,
  kind: 'fetch',
  image: 'fetch',
  egress: { kind: 'public' },
  grants: [],
  toolRoute: false,
};

async function runLifecycle(sandbox: Sandbox): Promise<void> {
  if (sandbox.suspension.kind !== 'memory') {
    throw new Error('imp keeps memory');
  }
  await sandbox.suspension.sleep();
  await sandbox.suspension.wake();
}

test('it records every create, grant, sleep, wake and destroy', async () => {
  const ctx = await setupImpAdapter();
  const sandbox = await ctx.adapter.create(conversationSpec);

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

test('it closes the forward for a sleep and opens it again after the wake', async () => {
  const ctx = await setupImpAdapter();
  const sandbox = await ctx.adapter.create(conversationSpec);
  const forward = `forward ${sandbox.id} ${ctx.imp.guestToolPort}`;

  await runLifecycle(sandbox);
  await sandbox.destroy();

  expect(ctx.imp.calls).toStrictEqual([
    `create ${sandbox.id}`,
    `grant ${sandbox.id} model-default`,
    forward,
    `forward-stopped ${sandbox.id}`,
    `sleep ${sandbox.id}`,
    `wake ${sandbox.id}`,
    forward,
    `forward-stopped ${sandbox.id}`,
    `remove ${sandbox.id}`,
  ]);
});

test('list returns every sandbox of the owner until it is destroyed', async () => {
  const ctx = await setupImpAdapter();
  const first = await ctx.adapter.create(conversationSpec);
  const second = await ctx.adapter.create({
    ...conversationSpec,
    kind: 'code_run',
    grants: [],
    toolRoute: false,
  });
  const before = await ctx.adapter.list('conversation:step-7');

  await first.destroy();

  const after = await ctx.adapter.list('conversation:step-7');

  expect(before.map((sandbox) => sandbox.id)).toStrictEqual([first.id, second.id]);
  expect(after.map((sandbox) => sandbox.id)).toStrictEqual([second.id]);
});

test('it creates the imp with policy none and leaves the grant to the broker', async () => {
  const ctx = await setupImpAdapter();
  const sandbox = await ctx.adapter.create(conversationSpec);

  expect(ctx.imp.created).toStrictEqual([
    {
      name: sandbox.id,
      image: 'conversation',
      vcpus: 2,
      memoryMib: 2048,
      diskMib: 4096,
      policy: { mode: 'none', allow: [] },
    },
  ]);
});

test.each([
  [{ ...fetchSpec, grants: [modelGrant] }, 'public egress with a grant'],
  [
    { ...conversationSpec, kind: 'coding', egress: { kind: 'public' } },
    'public egress with a grant',
  ],
  [
    { ...conversationSpec, egress: { kind: 'allow', hosts: ['github.com'] } },
    'a grant with egress outside a coding session (conversation)',
  ],
  [
    { ...conversationSpec, kind: 'worker', egress: { kind: 'allow', hosts: ['github.com'] } },
    'a grant with egress outside a coding session (worker)',
  ],
] as const)(
  'it refuses the spec and touches neither impd nor the log: %#',
  async (spec, reason) => {
    const ctx = await setupImpAdapter();

    expect(ctx.adapter.create(spec)).rejects.toThrow(new SandboxSpecRefusedError(reason));

    const records = await ctx.readSandboxRecords();

    expect(records).toStrictEqual([]);
    expect(ctx.imp.calls).toStrictEqual([]);
  },
);

test('it gives a coding session a box policy with its hosts beside its grant', async () => {
  const ctx = await setupImpAdapter();

  await ctx.adapter.create({
    ...conversationSpec,
    kind: 'coding',
    egress: { kind: 'allow', hosts: ['github.com', '*.npmjs.org'] },
  });

  expect(ctx.imp.created.at(0)?.policy).toStrictEqual({
    mode: 'box',
    allow: ['github.com', '*.npmjs.org'],
  });
});

test('it makes a public imp with imp public policy', async () => {
  const ctx = await setupImpAdapter();

  await ctx.adapter.create(fetchSpec);

  expect(ctx.imp.created.at(0)?.policy).toStrictEqual({ mode: 'public', allow: [] });
});

test('it refuses public egress on an impd that does not enforce it', async () => {
  const ctx = await setupImpAdapter();

  ctx.imp.features = { publicEgress: true, isEgressEnforced: false };

  expect(ctx.adapter.create(fetchSpec)).rejects.toThrow(
    new SandboxSpecRefusedError('public egress on an impd that does not enforce it'),
  );
});

test('it refuses public egress without the deployment host addresses', async () => {
  const ctx = await setupImpAdapter();

  expect(ctx.buildAdapter(null).create(fetchSpec)).rejects.toThrow(
    new SandboxSpecRefusedError('public egress without the host addresses in IMP_HOST_ADDRESSES'),
  );
});

test.each([
  [
    'model-wide',
    'grant model-wide must cover api.anthropic.com alone, and covers ["api.anthropic.com","example.com"]',
  ],
  ['missing', 'grant missing must cover api.anthropic.com alone, and covers null'],
])('it refuses a grant whose secret covers any host but its own: %s', async (secret, reason) => {
  const ctx = await setupImpAdapter();

  ctx.imp.secrets.set('model-wide', ['api.anthropic.com', 'example.com']);

  expect(
    ctx.adapter.create({ ...conversationSpec, grants: [{ ...modelGrant, secret }] }),
  ).rejects.toThrow(new SandboxSpecRefusedError(reason));
});

test('it records a failed create as destroyed and removes the imp', async () => {
  const ctx = await setupImpAdapter();

  ctx.imp.failCreate = true;

  expect(ctx.adapter.create(conversationSpec)).rejects.toThrow('RAM_BUDGET_EXCEEDED');

  const records = await ctx.readSandboxRecords();
  const listed = await ctx.adapter.list('conversation:step-7');

  expect(records.map((record) => [record.kind, record.payload['reason'] ?? null])).toStrictEqual([
    ['sandbox.created', null],
    ['sandbox.destroyed', 'create_failed'],
  ]);
  expect(ctx.imp.calls.map((call): unknown => call.split(' '))).toStrictEqual(
    records.map((record, index) => [
      index === 0 ? 'create' : 'remove',
      record.payload['sandboxID'],
    ]),
  );
  expect(listed).toStrictEqual([]);
});

test('it cuts exec output past 1 MiB, with the broker required and its NO_PROXY left alone', async () => {
  const ctx = await setupImpAdapter();
  const sandbox = await ctx.adapter.create(conversationSpec);
  const result = await sandbox.exec({
    argv: ['sh', '-c', 'head -c 1572864 /dev/zero; echo "$ANTHROPIC_API_KEY $NO_PROXY" >&2'],
  });

  expect(result).toMatchObject({
    code: 0,
    stdout: { totalBytes: 1_572_864, isCut: true },
    stderr: { isCut: false },
  });
  expect(result.stdout.bytes.byteLength).toBe(1_048_576);
  expect(decoder.decode(result.stderr.bytes)).toBe('broker-placeholder localhost,127.0.0.1,::1\n');
  expect(ctx.imp.execs.at(0)?.options).toMatchObject({ killGraceMs: 5000, requireBroker: true });
});

test('an exec in an imp with no grant passes the command env alone, with no broker required', async () => {
  const ctx = await setupImpAdapter();
  const sandbox = await ctx.adapter.create(fetchSpec);

  await sandbox.exec({ argv: ['true'], env: { FOO: 'bar' } });

  expect(ctx.imp.execs.at(0)?.options).toMatchObject({ requireBroker: false });
  expect(ctx.imp.execs.at(0)?.options.env).toStrictEqual({ FOO: 'bar' });
});

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- an async iterable has no readonly form
async function readNextMessage(stream: ExecStream): Promise<string> {
  const next = await stream.messages[Symbol.asyncIterator]().next();

  if (next.done === true) {
    throw new Error('the stream ended');
  }
  return decoder.decode(next.value);
}

test('a spawn stream carries framed messages, and a stop sends SIGTERM under the 5 s cgroup kill', async () => {
  const ctx = await setupImpAdapter();
  const sandbox = await ctx.adapter.create(conversationSpec);
  const stream = await sandbox.spawn({ argv: ['cat'], maxMessageBytes: 64 });

  await stream.send(encoder.encode('hello'));

  const message = await readNextMessage(stream);
  const exit = await stream.stop();

  expect(message).toBe('hello');
  expect(exit.signal).toBe('SIGTERM');
  expect(ctx.imp.execs.at(0)).toMatchObject({
    argv: ['cat'],
    options: { killGraceMs: 5000 },
    signals: ['SIGTERM'],
  });
});

const fetchScript =
  'const r = await fetch(process.env.TOOL_URL + "/mcp", { headers: { authorization: "Bearer run-token" } }); console.log(await r.text())';

async function runToolCall(sandbox: Sandbox, url: string): Promise<unknown> {
  const result = await sandbox.exec({
    argv: [process.execPath, '-e', fetchScript],
    env: { TOOL_URL: url },
  });

  return JSON.parse(decoder.decode(result.stdout.bytes));
}

test('the guest reaches the tool endpoint through the reverse forward, again after a wake', async () => {
  const ctx = await setupImpAdapter();
  const sandbox = await ctx.adapter.create(conversationSpec);
  const route = await sandbox.toolRoute();
  const before = await runToolCall(sandbox, route?.url ?? '');

  await runLifecycle(sandbox);

  const after = await runToolCall(sandbox, route?.url ?? '');

  expect(route).toStrictEqual({ url: `http://127.0.0.1:${ctx.imp.guestToolPort}` });
  expect([before, after]).toStrictEqual([
    { path: '/mcp', authorization: 'Bearer run-token' },
    { path: '/mcp', authorization: 'Bearer run-token' },
  ]);
});

test('it copies files in and out through the guest', async () => {
  const ctx = await setupImpAdapter();
  const sandbox = await ctx.adapter.create(conversationSpec);
  const path = join(ctx.dir, 'work', 'in.txt');

  await sandbox.copyIn([{ path, content: encoder.encode('hello') }]);

  const [out] = await sandbox.copyOut([path]);

  expect(decoder.decode(out?.content)).toBe('hello');
  expect(sandbox.copyOut(['/tmp/../etc/passwd'])).rejects.toThrow(
    'a guest path must be absolute and must not climb: /tmp/../etc/passwd',
  );
});

test('a restarted adapter lists and destroys what the last one made, for recovery', async () => {
  const ctx = await setupImpAdapter();
  const made = await ctx.adapter.create(conversationSpec);
  const restarted = ctx.buildAdapter(null);
  const [orphan] = await restarted.list('conversation:step-7');

  await orphan?.destroy();

  const found = await restarted.get(made.id);

  expect(orphan?.spec).toStrictEqual(conversationSpec);
  expect(found).toBeNull();
  expect(ctx.imp.calls.at(-1)).toBe(`remove ${made.id}`);
});

test('a session that impd loses after a stop rejects the exit and leaves the host running', async () => {
  const ctx = await setupImpAdapter();
  const sandbox = await ctx.adapter.create(conversationSpec);

  ctx.imp.failExitOnStop = true;

  const stream = await sandbox.spawn({ argv: ['sleep', '60'], maxMessageBytes: 64 });

  expect(stream.stop()).rejects.toThrow('CONNECTION_CLOSED');
});

test('a guest connection to a tool endpoint that is down fails that connection alone', async () => {
  const ctx = await setupImpAdapter();
  const adapter = ctx.buildAdapterWithTarget({ path: join(ctx.dir, 'missing.sock') });
  const sandbox = await adapter.create(conversationSpec);
  const route = await sandbox.toolRoute();
  const result = await sandbox.exec({
    argv: [
      process.execPath,
      '-e',
      'await fetch(process.env.TOOL_URL).catch(() => console.log("failed"))',
    ],
    env: { TOOL_URL: route?.url ?? '' },
  });

  expect(decoder.decode(result.stdout.bytes)).toBe('failed\n');
});

test('a call on a sleeping imp records the wake it causes', async () => {
  const ctx = await setupImpAdapter();
  const sandbox = await ctx.adapter.create(conversationSpec);

  if (sandbox.suspension.kind !== 'memory') {
    throw new Error('imp keeps memory');
  }
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

test('copyOut refuses a guest file past 64 MiB', async () => {
  const ctx = await setupImpAdapter();
  const sandbox = await ctx.adapter.create(conversationSpec);

  expect(sandbox.copyOut(['/dev/zero'])).rejects.toThrow(
    'copy out of /dev/zero failed: the file passes 67108864 bytes',
  );
});
