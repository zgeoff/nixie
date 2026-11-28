import { expect, test } from 'bun:test';
import { SandboxSpecRefusedError } from '@heynixie/sandbox';
import { buildMockSandboxSpec } from '@heynixie/sandbox/test-utils';
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
  expect(adapter.spawned).toStrictEqual([{ sandboxID: sandbox.id, argv: ['fetcher'], env: {} }]);
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

test('it answers a create whose failure waits only once the wait settles', async () => {
  const gate = Promise.withResolvers<void>();

  const adapter = buildStubSandboxAdapter(() => Promise.resolve(0), {
    createFailures: [{ kind: 'wait', until: gate.promise }],
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

  gate.resolve();

  const sandbox = await create;

  expect(first).toBe('pending');
  expect(adapter.created.map((created) => created.id)).toStrictEqual([sandbox.id]);
});

test('it answers a list whose failure waits only once the wait settles', async () => {
  const gate = Promise.withResolvers<void>();

  const adapter = buildStubSandboxAdapter(() => Promise.resolve(0), {
    listFailures: [{ kind: 'wait', until: gate.promise }],
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

  const list = adapter.list('web_fetch');

  const first = await Promise.race([list, adapter.read(sandbox.id).then(() => 'pending')]);

  gate.resolve();

  const listed = await list;

  expect(first).toBe('pending');
  expect(listed.map((found) => found.id)).toStrictEqual([sandbox.id]);
});

test('it keeps a sandbox whose destroy is refused, and records no destroy', async () => {
  const adapter = buildStubSandboxAdapter(() => Promise.resolve(0), {
    destroyFailures: [{ kind: 'reject', message: 'impd is down' }],
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

  const settled = await Promise.allSettled([sandbox.destroy()]);

  expect(settled).toMatchObject([{ status: 'rejected', reason: expect.any(Error) }]);

  const listed = await adapter.list('web_fetch');

  expect(listed.map((found) => found.id)).toStrictEqual([sandbox.id]);
  expect(adapter.destroyed).toStrictEqual([]);
});

test('it destroys a sandbox once its waiting destroy settles', async () => {
  const gate = Promise.withResolvers<void>();

  const adapter = buildStubSandboxAdapter(() => Promise.resolve(0), {
    destroyFailures: [{ kind: 'wait', until: gate.promise }],
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

  const destroy = sandbox.destroy();

  const held = await adapter.list('web_fetch');

  gate.resolve();

  await destroy;

  expect(held.map((found) => found.id)).toStrictEqual([sandbox.id]);
  expect(adapter.destroyed).toStrictEqual([sandbox.id]);
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

test('it keeps the files that a sandbox copies in, and gives them back on copy out', async () => {
  const adapter = buildStubSandboxAdapter(() => Promise.resolve(0));

  const sandbox = await adapter.create(
    buildMockSandboxSpec({ kind: 'code_run', toolRoute: false }),
  );

  const content = new TextEncoder().encode('data');

  await sandbox.copyIn([{ path: '/work/a.txt', content }]);

  const copied = await sandbox.copyOut(['/work/a.txt']);

  expect(copied).toStrictEqual([{ path: '/work/a.txt', content }]);
});

test('it refuses a copy out of a file the sandbox does not hold', async () => {
  const adapter = buildStubSandboxAdapter(() => Promise.resolve(0));

  const sandbox = await adapter.create(
    buildMockSandboxSpec({ kind: 'code_run', toolRoute: false }),
  );

  await expect(sandbox.copyOut(['/work/missing.txt'])).toReject();
});

test('it records each exec and answers it with the exec it was given', async () => {
  const adapter = buildStubSandboxAdapter(() => Promise.resolve(0), {
    exec: () =>
      Promise.resolve({
        code: 0,
        signal: null,
        stdout: { bytes: new Uint8Array(), totalBytes: 0, isCut: false },
        stderr: { bytes: new Uint8Array(), totalBytes: 0, isCut: false },
        durationMs: 5,
      }),
  });

  const sandbox = await adapter.create(
    buildMockSandboxSpec({ kind: 'code_run', toolRoute: false }),
  );

  await sandbox.exec({ argv: ['echo', 'hi'] });

  expect(adapter.execs).toStrictEqual([
    { sandboxID: sandbox.id, command: { argv: ['echo', 'hi'] } },
  ]);
});

test('it refuses an exec and a copy in of a destroyed sandbox', async () => {
  const adapter = buildStubSandboxAdapter(() => Promise.resolve(0), {
    exec: () => Promise.reject(new Error('unreachable')),
  });

  const sandbox = await adapter.create(
    buildMockSandboxSpec({ kind: 'code_run', toolRoute: false }),
  );

  await sandbox.destroy();

  await expect(sandbox.exec({ argv: ['echo'] })).toReject();
  await expect(sandbox.copyIn([])).toReject();
});

test('it leaves the exit of a guest open when the adapter ignores a stop', async () => {
  const adapter = buildStubSandboxAdapter(() => Promise.withResolvers<number>().promise, {
    isStopIgnored: true,
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

  const settled = await Promise.race([
    stream.stop().then(() => 'stopped'),
    Promise.resolve('still running'),
  ]);

  expect(settled).toBe('still running');
});

test('it keeps the sandbox whose destroy a later failNextDestroy refuses', async () => {
  const adapter = buildStubSandboxAdapter(() => Promise.resolve(0));

  const sandbox = await adapter.create(buildMockSandboxSpec({ owner: 'web_fetch' }));

  adapter.failNextDestroy('impd is down');

  const outcome = await Promise.allSettled([sandbox.destroy()]);
  const listed = await adapter.list('web_fetch');

  expect(outcome).toMatchObject([{ status: 'rejected' }]);
  expect(listed.map((found) => found.id)).toStrictEqual([sandbox.id]);
});

test('it rejects the next file listing after failNextFileList', async () => {
  const adapter = buildStubSandboxAdapter(() => Promise.resolve(0));

  const sandbox = await adapter.create(buildMockSandboxSpec({ owner: 'web_fetch' }));

  adapter.failNextFileList('impd is down');

  expect(sandbox.readFilePaths('/home/stub')).rejects.toThrowWithMessage(Error, /impd is down/u);
});
