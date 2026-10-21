import { expect, test } from 'bun:test';
import { SandboxSpecRefusedError } from '@heynixie/sandbox';
import { encodeFrame } from '@heynixie/wire';
import { buildStubSandboxAdapter } from './build-stub-sandbox-adapter';

test('it runs each spawn as a guest behind frames and records it', async () => {
  const encoder = new TextEncoder();

  const adapter = buildStubSandboxAdapter(async (stdin, stdout) => {
    const reader = stdin.getReader();

    const chunk = await reader.read();

    await stdout.write(chunk.value ?? new Uint8Array());

    return 0;
  });

  const sandbox = await adapter.create({
    kind: 'fetch',
    image: 'fetch',
    owner: 'web_fetch',
    egress: { kind: 'public' },
    grants: [],
    toolRoute: false,
    limits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  const stream = await sandbox.spawn({ argv: ['fetcher'], maxMessageBytes: 100 });

  await stream.send(encoder.encode('echo'));

  const first = await stream.messages[Symbol.asyncIterator]().next();
  const exit = await stream.exit;

  expect(first).toStrictEqual({ done: false, value: encoder.encode('echo') });
  expect(exit).toMatchObject({ code: 0, signal: null });
  expect(adapter.spawned).toStrictEqual([{ sandboxID: sandbox.id, argv: ['fetcher'] }]);
});

test('it takes a write that the guest never reads, as a pipe buffers it', async () => {
  const encoder = new TextEncoder();

  const adapter = buildStubSandboxAdapter(() => Promise.withResolvers<number>().promise);

  const sandbox = await adapter.create({
    kind: 'fetch',
    image: 'fetch',
    owner: 'web_fetch',
    egress: { kind: 'public' },
    grants: [],
    toolRoute: false,
    limits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  const stream = await sandbox.spawn({ argv: ['fetcher'], maxMessageBytes: 100 });

  await expect(stream.send(encoder.encode('unread'))).toResolve();
});

test('it ends a stopped guest with SIGTERM', async () => {
  const adapter = buildStubSandboxAdapter(() => Promise.withResolvers<number>().promise);

  const sandbox = await adapter.create({
    kind: 'fetch',
    image: 'fetch',
    owner: 'web_fetch',
    egress: { kind: 'public' },
    grants: [],
    toolRoute: false,
    limits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  const stream = await sandbox.spawn({ argv: ['fetcher'], maxMessageBytes: 100 });
  const exit = await stream.stop();

  expect(exit).toMatchObject({ code: null, signal: 'SIGTERM' });
});

test('it ends a guest that throws with exit code 1', async () => {
  const adapter = buildStubSandboxAdapter(() => Promise.reject(new Error('crashed')));

  const sandbox = await adapter.create({
    kind: 'fetch',
    image: 'fetch',
    owner: 'web_fetch',
    egress: { kind: 'public' },
    grants: [],
    toolRoute: false,
    limits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  const stream = await sandbox.spawn({ argv: ['fetcher'], maxMessageBytes: 100 });
  const exit = await stream.exit;

  expect(exit).toMatchObject({ code: 1, signal: null });
});

test('it refuses a spawn in a destroyed sandbox', async () => {
  const adapter = buildStubSandboxAdapter(() => Promise.resolve(0));

  const sandbox = await adapter.create({
    kind: 'fetch',
    image: 'fetch',
    owner: 'web_fetch',
    egress: { kind: 'public' },
    grants: [],
    toolRoute: false,
    limits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  await sandbox.destroy();

  expect(sandbox.spawn({ argv: ['fetcher'], maxMessageBytes: 100 })).rejects.toThrowWithMessage(
    Error,
    `sandbox ${sandbox.id} is destroyed`,
  );

  expect(adapter.destroyed).toStrictEqual([sandbox.id]);
});

test('it lists the live sandboxes of an owner only', async () => {
  const adapter = buildStubSandboxAdapter(() => Promise.resolve(0));

  const spec = {
    kind: 'fetch' as const,
    image: 'fetch',
    egress: { kind: 'public' as const },
    grants: [],
    toolRoute: false,
    limits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  };

  const kept = await adapter.create({ ...spec, owner: 'web_fetch' });
  const gone = await adapter.create({ ...spec, owner: 'web_fetch' });

  await adapter.create({ ...spec, owner: 'other' });
  await gone.destroy();

  const listed = await adapter.list('web_fetch');

  expect(listed.map((sandbox) => sandbox.id)).toStrictEqual([kept.id]);
});

test('it counts the most sandboxes that were live at one time', async () => {
  const adapter = buildStubSandboxAdapter(() => Promise.resolve(0));

  const spec = {
    kind: 'fetch' as const,
    image: 'fetch',
    owner: 'web_fetch',
    egress: { kind: 'public' as const },
    grants: [],
    toolRoute: false,
    limits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  };

  const first = await adapter.create(spec);

  await adapter.create(spec);
  await first.destroy();
  await adapter.create(spec);

  expect(adapter.countMostLive()).toBe(2);
});

test('it refuses a spec a real adapter refuses', () => {
  const adapter = buildStubSandboxAdapter(() => Promise.resolve(0));

  expect(
    adapter.create({
      kind: 'fetch',
      image: 'fetch',
      owner: 'web_fetch',
      egress: { kind: 'public' },
      grants: [{ secret: 'model', host: 'api.anthropic.com', env: {} }],
      toolRoute: false,
      limits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
    }),
  ).rejects.toThrow(SandboxSpecRefusedError);

  expect(adapter.created).toStrictEqual([]);
});

test('it refuses a create with the message its failure names, and records no sandbox', () => {
  const adapter = buildStubSandboxAdapter(() => Promise.resolve(0), {
    createFailures: [{ kind: 'reject', message: 'impd is down' }],
  });

  expect(
    adapter.create({
      kind: 'fetch',
      image: 'fetch',
      owner: 'web_fetch',
      egress: { kind: 'public' },
      grants: [],
      toolRoute: false,
      limits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
    }),
  ).rejects.toThrowWithMessage(Error, 'impd is down');

  expect(adapter.created).toStrictEqual([]);
});

test('it never answers a create whose failure hangs', async () => {
  const adapter = buildStubSandboxAdapter(() => Promise.resolve(0), {
    createFailures: [{ kind: 'hang' }],
  });

  const create = adapter.create({
    kind: 'fetch',
    image: 'fetch',
    owner: 'web_fetch',
    egress: { kind: 'public' },
    grants: [],
    toolRoute: false,
    limits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  const first = await Promise.race([create, adapter.list('web_fetch').then(() => 'pending')]);

  expect(first).toBe('pending');
  expect(adapter.created).toStrictEqual([]);
});

test('it creates a sandbox once the named failures are spent', async () => {
  const adapter = buildStubSandboxAdapter(() => Promise.resolve(0), {
    createFailures: [{ kind: 'reject', message: 'impd is down' }],
  });

  const spec = {
    kind: 'fetch' as const,
    image: 'fetch',
    owner: 'web_fetch',
    egress: { kind: 'public' as const },
    grants: [],
    toolRoute: false,
    limits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  };

  await adapter.create(spec).catch(() => null);

  const sandbox = await adapter.create(spec);

  expect(adapter.created).toStrictEqual([{ id: sandbox.id, spec }]);
});

test('it ends the messages with none when the guest exits partway through a frame', async () => {
  const encoder = new TextEncoder();

  const adapter = buildStubSandboxAdapter(async (_stdin, stdout) => {
    await stdout.write(encodeFrame(encoder.encode('framed')).slice(0, 5));

    return 0;
  });

  const sandbox = await adapter.create({
    kind: 'fetch',
    image: 'fetch',
    owner: 'web_fetch',
    egress: { kind: 'public' },
    grants: [],
    toolRoute: false,
    limits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  const stream = await sandbox.spawn({ argv: ['fetcher'], maxMessageBytes: 100 });
  const first = await stream.messages[Symbol.asyncIterator]().next();

  expect(first.done).toBeTrue();
});
