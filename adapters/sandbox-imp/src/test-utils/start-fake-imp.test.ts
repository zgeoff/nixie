import { expect, onTestFinished, test } from 'bun:test';
import { memoryKillsArgv } from '../memory/memory-kills-argv';
import { rebindSecret, seedSecret } from './seed-secret';
import { startFakeImp } from './start-fake-imp';
import { startSharedImpd } from './start-impd';

async function setupTest() {
  const started = await startSharedImpd();
  const imp = await startFakeImp(started);

  await imp.port.createImp({
    name: 'harbour',
    image: 'harbour-image',
    vcpus: 1,
    memoryMib: 512,
    diskMib: 1024,
    policy: { mode: 'none', allow: [] },
    backup: false,
  });

  return { imp, impd: started.impd };
}

test('it refuses an exec that requires the broker and replaces a broker variable', async () => {
  const ctx = await setupTest();

  await seedSecret(ctx.impd, 'model-default', ['api.anthropic.com']);

  await ctx.imp.port.addGrant('harbour', 'model-default');

  const exec = await ctx.imp.port.openExec('harbour', ['true'], {
    env: { NO_PROXY: 'example.com' },
    killGraceMs: 5000,
    requireBroker: true,
  });

  expect(exec.started).rejects.toThrow(
    "the broker is not ready for this exec: the exec's env sets NO_PROXY, which the broker sets",
  );
});

test('it returns an exec handle during an idle sleep and starts the exec once the sleep ends', async () => {
  const ctx = await setupTest();

  const snapshot = Promise.withResolvers<void>();

  void ctx.imp.startIdleSleep('harbour', snapshot.promise);

  const exec = await ctx.imp.port.openExec('harbour', ['true'], {
    env: {},
    killGraceMs: 5000,
    requireBroker: false,
  });

  const before = await Promise.race([exec.started, Promise.resolve('starting')]);

  snapshot.resolve();

  await exec.started;

  expect(before).toBe('starting');
  expect(ctx.imp.events).toStrictEqual(['wait exec harbour', 'woken by exec harbour']);
});

test('it runs an exec with the broker variables when the exec requires the broker', async () => {
  const ctx = await setupTest();

  await seedSecret(ctx.impd, 'model-default', ['api.anthropic.com']);

  await ctx.imp.port.addGrant('harbour', 'model-default');

  const exec = await ctx.imp.port.openExec(
    'harbour',
    ['sh', '-c', 'echo "$HTTPS_PROXY $NO_PROXY"'],
    { env: {}, killGraceMs: 5000, requireBroker: true },
  );

  const output = await new Response(exec.stdout).text();

  expect(output).toBe('http://broker.invalid:3128 localhost,127.0.0.1,::1\n');
});

test('it refuses an exec that requires the broker on an imp that holds no grant', async () => {
  const ctx = await setupTest();

  const exec = await ctx.imp.port.openExec('harbour', ['true'], {
    env: {},
    killGraceMs: 5000,
    requireBroker: true,
  });

  expect(exec.started).rejects.toThrow(
    'the broker is not ready for this exec: the imp has no grant, so impd sets no broker variables',
  );
});

test('it refuses an exec that requires the broker once a rebind takes the imp grant', async () => {
  const ctx = await setupTest();

  await seedSecret(ctx.impd, 'model-default', ['api.anthropic.com']);

  await ctx.imp.port.addGrant('harbour', 'model-default');

  await rebindSecret(ctx.impd, 'model-default', ['api.anthropic.com']);

  const exec = await ctx.imp.port.openExec('harbour', ['true'], {
    env: {},
    killGraceMs: 5000,
    requireBroker: true,
  });

  expect(exec.started).rejects.toThrow('the imp has no grant');
});

test('it runs an exec that does not require the broker on an imp whose grant a rebind took', async () => {
  const ctx = await setupTest();

  await seedSecret(ctx.impd, 'model-default', ['api.anthropic.com']);

  await ctx.imp.port.addGrant('harbour', 'model-default');

  await rebindSecret(ctx.impd, 'model-default', ['api.anthropic.com']);

  const exec = await ctx.imp.port.openExec('harbour', ['true'], {
    env: {},
    killGraceMs: 5000,
    requireBroker: false,
  });

  expect(exec.exit).resolves.toStrictEqual({ code: 0, signal: null });
});

test('it reports an exec that a signal with no name ended with the signal as its number', async () => {
  const ctx = await setupTest();

  const exec = await ctx.imp.port.openExec('harbour', ['sh', '-c', 'kill -34 $$'], {
    env: {},
    killGraceMs: 5000,
    requireBroker: false,
  });

  const exit = await exec.exit;

  expect(exit).toStrictEqual({ code: null, signal: '34' });
});

test('it kills an exec that outlives SIGTERM at its kill grace', async () => {
  const ctx = await setupTest();

  const exec = await ctx.imp.port.openExec(
    'harbour',
    ['sh', '-c', 'trap "" TERM; echo ready; sleep 60'],
    { env: {}, killGraceMs: 100, requireBroker: false },
  );

  await exec.stdout.getReader().read();

  exec.sendSignal('SIGTERM');

  const exit = await exec.exit;

  expect(exit).toStrictEqual({ code: null, signal: 'SIGKILL' });
  expect(ctx.imp.execs.at(0)?.signals).toStrictEqual(['SIGTERM']);
});

test('it rejects the exit of a session it loses on a stop, when told to', async () => {
  const ctx = await setupTest();

  ctx.imp.failExitOnStop = true;

  const exec = await ctx.imp.port.openExec('harbour', ['sleep', '60'], {
    env: {},
    killGraceMs: 5000,
    requireBroker: false,
  });

  exec.sendSignal('SIGTERM');

  expect(exec.exit).rejects.toThrow('CONNECTION_CLOSED');
});

test('it carries a dial of the tool port in the guest to the reverse forward of the imp', async () => {
  const ctx = await setupTest();

  const forward = ctx.imp.port.openReverseForward('harbour', ctx.imp.guestToolPort, (accept) => {
    const relay = accept({
      onData: (data) => {
        relay.send(data);
      },
      onEof: () => {},
      onClose: () => {},
    });
  });

  await forward.listening;

  await ctx.imp.port.openExec('harbour', ['true'], {
    env: {},
    killGraceMs: 5000,
    requireBroker: false,
  });

  const answered = Promise.withResolvers<string>();

  const socket = await Bun.connect({
    hostname: '127.0.0.1',
    port: ctx.imp.guestToolPort,
    socket: {
      data: (_socket, data) => {
        answered.resolve(new TextDecoder().decode(data));
      },
    },
  });

  onTestFinished(() => {
    socket.end();
  });

  socket.write('ping');

  expect(answered.promise).resolves.toBe('ping');
});

test('it ends a dial of the tool port that no forward pairs', async () => {
  const ctx = await setupTest();

  await ctx.imp.port.openExec('harbour', ['true'], {
    env: {},
    killGraceMs: 5000,
    requireBroker: false,
  });

  const closed = Promise.withResolvers<string>();

  await Bun.connect({
    hostname: '127.0.0.1',
    port: ctx.imp.guestToolPort,
    socket: {
      data: () => {},
      close: () => {
        closed.resolve('closed');
      },
    },
  });

  expect(closed.promise).resolves.toBe('closed');
});

test('it holds a wake and an exec until an idle sleep ends, then wakes the imp once', async () => {
  const ctx = await setupTest();

  const snapshot = Promise.withResolvers<void>();

  void ctx.imp.startIdleSleep('harbour', snapshot.promise);
  const wake = ctx.imp.port.wakeImp('harbour');

  const exec = ctx.imp.port.openExec('harbour', ['true'], {
    env: {},
    killGraceMs: 5000,
    requireBroker: false,
  });

  snapshot.resolve();

  await Promise.all([wake, exec]);

  expect(ctx.imp.events).toStrictEqual(['wait wake harbour', 'wait exec harbour']);
});

test('it starts the idle sleep set for the next wake of the imp once that wake ends', async () => {
  const ctx = await setupTest();

  const snapshot = Promise.withResolvers<void>();

  ctx.imp.sleepsAfterWake.set('harbour', snapshot.promise);

  await ctx.imp.port.wakeImp('harbour');

  const exec = await ctx.imp.port.openExec('harbour', ['true'], {
    env: {},
    killGraceMs: 5000,
    requireBroker: false,
  });

  snapshot.resolve();

  await exec.started;

  expect(ctx.imp.sleepsAfterWake.size).toBe(0);
  expect(ctx.imp.events).toStrictEqual(['wait exec harbour', 'woken by exec harbour']);
});

test('it kills each exec process group and closes the tool port when the test finishes', async () => {
  const ctx = await setupTest();

  const exec = await ctx.imp.port.openExec('harbour', ['sh', '-c', 'echo $$; exec sleep 60'], {
    env: {},
    killGraceMs: 5000,
    requireBroker: false,
  });

  const read = await exec.stdout.getReader().read();

  const pid = Number(new TextDecoder().decode(read.value).trim());

  onTestFinished(async () => {
    await exec.exit;

    expect(() => process.kill(-pid, 0)).toThrow();

    expect(
      Bun.connect({
        hostname: '127.0.0.1',
        port: ctx.imp.guestToolPort,
        socket: { data: () => {} },
      }),
    ).rejects.toThrow();
  });

  expect(pid).toBeGreaterThan(0);
});

test('it records an image add, then refuses it as impd does a scoped token, when told to', async () => {
  const ctx = await setupTest();

  ctx.imp.refuseImageAdd = true;

  expect(
    ctx.imp.port.addImage({
      name: 'nixie-fetch',
      digest: `sha256:${'a'.repeat(64)}`,
      ref: `ghcr.io/example/nixie-fetch@sha256:${'a'.repeat(64)}`,
    }),
  ).rejects.toThrowWithMessage(Error, /is limited to some imps; this call is host-wide$/u);

  expect(ctx.imp.imageAdds.map((add) => [add.name, add.ref])).toStrictEqual([
    ['nixie-fetch', `ghcr.io/example/nixie-fetch@sha256:${'a'.repeat(64)}`],
  ]);

  expect(ctx.imp.images.size).toBe(0);
});

test('it lists each image it holds with its digest and reference', async () => {
  const ctx = await setupTest();

  await ctx.imp.port.addImage({
    name: 'nixie-fetch',
    digest: `sha256:${'a'.repeat(64)}`,
    ref: `ghcr.io/example/nixie-fetch@sha256:${'a'.repeat(64)}`,
  });

  const images = await ctx.imp.port.listImages();

  expect(images).toStrictEqual([
    {
      name: 'nixie-fetch',
      digest: `sha256:${'a'.repeat(64)}`,
      ref: `ghcr.io/example/nixie-fetch@sha256:${'a'.repeat(64)}`,
    },
  ]);
});

test('it answers the memory kills read with a count of 0 and no host process, by default', async () => {
  const ctx = await setupTest();

  const exec = await ctx.imp.port.openExec('harbour', memoryKillsArgv, {
    env: {},
    killGraceMs: 5000,
    requireBroker: false,
  });

  const [stdout, exit] = await Promise.allSettled([new Response(exec.stdout).text(), exec.exit]);

  const read = { stdout, exit };

  expect(read).toStrictEqual({
    stdout: { status: 'fulfilled', value: expect.stringContaining('oom_kill 0\n') },
    exit: { status: 'fulfilled', value: { code: 0, signal: null } },
  });

  expect(ctx.imp.memoryKillReads).toStrictEqual(['harbour']);
  expect(ctx.imp.execs).toStrictEqual([]);
});

test('it answers the memory kills read with the count a test sets', async () => {
  const ctx = await setupTest();

  ctx.imp.memoryKills = 3;

  const exec = await ctx.imp.port.openExec('harbour', memoryKillsArgv, {
    env: {},
    killGraceMs: 5000,
    requireBroker: false,
  });

  const [stdout, exit] = await Promise.allSettled([new Response(exec.stdout).text(), exec.exit]);

  const read = { stdout, exit };

  expect(read.stdout).toStrictEqual({
    status: 'fulfilled',
    value: expect.stringContaining('oom_kill 3\n'),
  });
});

test('it answers the memory kills read with no output when the file is missing', async () => {
  const ctx = await setupTest();

  ctx.imp.memoryKills = 'missing';

  const exec = await ctx.imp.port.openExec('harbour', memoryKillsArgv, {
    env: {},
    killGraceMs: 5000,
    requireBroker: false,
  });

  const [stdout, exit] = await Promise.allSettled([new Response(exec.stdout).text(), exec.exit]);

  const read = { stdout, exit };

  expect(read).toStrictEqual({
    stdout: { status: 'fulfilled', value: '' },
    exit: { status: 'fulfilled', value: { code: 0, signal: null } },
  });
});

test('it rejects the exit of the memory kills read on a lost connection', async () => {
  const ctx = await setupTest();

  ctx.imp.memoryKills = 'lost';

  const exec = await ctx.imp.port.openExec('harbour', memoryKillsArgv, {
    env: {},
    killGraceMs: 5000,
    requireBroker: false,
  });

  const [stdout, exit] = await Promise.allSettled([new Response(exec.stdout).text(), exec.exit]);

  const read = { stdout, exit };

  expect(read.exit).toStrictEqual({ status: 'rejected', reason: new Error('CONNECTION_CLOSED') });
});

test('it holds the memory kills read until an idle sleep ends', async () => {
  const ctx = await setupTest();

  const snapshot = Promise.withResolvers<void>();

  void ctx.imp.startIdleSleep('harbour', snapshot.promise);

  const exec = await ctx.imp.port.openExec('harbour', memoryKillsArgv, {
    env: {},
    killGraceMs: 5000,
    requireBroker: false,
  });

  const before = await Promise.race([exec.started, Promise.resolve('starting')]);

  snapshot.resolve();

  await exec.started;

  expect(before).toBe('starting');
});

test('it runs an exec on the host when its argv only contains the memory kills argv', async () => {
  const ctx = await setupTest();

  const exec = await ctx.imp.port.openExec('harbour', [...memoryKillsArgv, 'extra'], {
    env: {},
    killGraceMs: 5000,
    requireBroker: false,
  });

  await exec.started;

  expect(ctx.imp.memoryKillReads).toStrictEqual([]);
});
