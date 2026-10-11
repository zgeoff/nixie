import { expect, test } from 'bun:test';
import { SandboxSpecRefusedError } from '@heynixie/sandbox';
import { encodeFrame } from '@heynixie/wire';
import { buildStubSandboxAdapter } from './build-stub-sandbox-adapter';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

test('it runs each spawn as a guest behind frames and records it', async () => {
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

  expect(decoder.decode(first.value)).toBe('echo');
  expect(exit).toMatchObject({ code: 0, signal: null });
  expect(adapter.spawned).toStrictEqual([{ sandboxID: sandbox.id, argv: ['fetcher'] }]);
});

test('it takes a write that the guest never reads, as a pipe buffers it', async () => {
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

test('it ends the messages with none when the guest exits partway through a frame', async () => {
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
