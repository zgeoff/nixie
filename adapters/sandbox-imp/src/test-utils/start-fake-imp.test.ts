import { expect, onTestFinished, test } from 'bun:test';
import { startFakeImp } from './start-fake-imp';

test('it holds no secret until a test adds one', async () => {
  const imp = await startFakeImp();
  const hosts = await imp.port.readSecretHosts('model-default');

  expect(hosts).toBeNull();
});

test('it stores a secret for its one host and logs the call', async () => {
  const imp = await startFakeImp();

  await imp.port.addSecret({
    name: 'model-chat-1',
    value: 'not-a-real-key',
    host: 'gateway.example',
    header: 'authorization',
    scheme: 'bearer',
  });

  const hosts = await imp.port.readSecretHosts('model-chat-1');

  expect(hosts).toStrictEqual(['gateway.example']);
  expect(imp.calls).toStrictEqual(['secret model-chat-1 gateway.example authorization bearer']);
});

test('it logs a create, then refuses it as impd does without the RAM, when told to', async () => {
  const imp = await startFakeImp();

  imp.failCreate = true;

  expect(
    imp.port.createImp({
      name: 'nixie-a',
      image: 'conversation',
      vcpus: 1,
      memoryMib: 512,
      diskMib: 1024,
      policy: { mode: 'none', allow: [] },
      backup: false,
    }),
  ).rejects.toThrow('RAM_BUDGET_EXCEEDED');

  expect(imp.calls).toStrictEqual(['create nixie-a']);
  expect(imp.created).toStrictEqual([]);
});

test('it reads the backup flag of the newest create of the name', async () => {
  const imp = await startFakeImp();

  imp.created.push(
    {
      name: 'nixie-a',
      image: 'conversation',
      vcpus: 1,
      memoryMib: 512,
      diskMib: 1024,
      policy: { mode: 'none', allow: [] },
      backup: true,
    },
    {
      name: 'nixie-a',
      image: 'conversation',
      vcpus: 1,
      memoryMib: 512,
      diskMib: 1024,
      policy: { mode: 'none', allow: [] },
      backup: false,
    },
  );

  expect(imp.port.readImpBackup('nixie-a')).resolves.toBeFalse();
});

test('it reads no backup flag for a name it never created', async () => {
  const imp = await startFakeImp();

  expect(imp.port.readImpBackup('nixie-a')).resolves.toBeNull();
});

test('it logs a remove, then fails it, when told to', async () => {
  const imp = await startFakeImp();

  imp.failRemove = true;

  expect(imp.port.removeImp('nixie-a')).rejects.toThrow('INTERNAL_SERVER_ERROR');
  expect(imp.calls).toStrictEqual(['remove nixie-a']);
});

test('it refuses the features call, as an impd that does not answer, when told to', async () => {
  const imp = await startFakeImp();

  imp.failFeatures = true;

  expect(imp.port.readFeatures()).rejects.toThrow('connect ECONNREFUSED');
});

test('it refuses an exec that requires the broker and replaces a broker variable', async () => {
  const imp = await startFakeImp();

  const exec = await imp.port.openExec('nixie-a', ['true'], {
    env: { NO_PROXY: 'example.com' },
    killGraceMs: 5000,
    requireBroker: true,
  });

  expect(exec.started).rejects.toThrow(
    "the broker is not ready for this exec: the exec's env sets NO_PROXY, which the broker sets",
  );
});

test('it returns an exec handle during an idle sleep and starts the exec once the sleep ends', async () => {
  const imp = await startFakeImp();

  const snapshot = Promise.withResolvers<void>();

  void imp.startIdleSleep('nixie-a', snapshot.promise);

  const exec = await imp.port.openExec('nixie-a', ['true'], {
    env: {},
    killGraceMs: 5000,
    requireBroker: false,
  });

  const before = await Promise.race([exec.started, Promise.resolve('starting')]);

  snapshot.resolve();

  await exec.started;

  expect(before).toBe('starting');

  expect(imp.calls).toStrictEqual([
    'idle-sleep nixie-a',
    'wait exec nixie-a',
    'slept nixie-a',
    'woken by exec nixie-a',
  ]);
});

test('it runs an exec with the broker variables when the exec requires the broker', async () => {
  const imp = await startFakeImp();

  const exec = await imp.port.openExec('nixie-a', ['sh', '-c', 'echo "$HTTPS_PROXY $NO_PROXY"'], {
    env: {},
    killGraceMs: 5000,
    requireBroker: true,
  });

  const output = await new Response(exec.stdout).text();

  expect(output).toBe('http://broker.invalid:3128 localhost,127.0.0.1,::1\n');
});

// 34 is a real-time signal, which has no name, so Bun gives it as a number
test('it reports an exec that a signal with no name ended with the signal as its number', async () => {
  const imp = await startFakeImp();

  const exec = await imp.port.openExec('nixie-a', ['sh', '-c', 'kill -34 $$'], {
    env: {},
    killGraceMs: 5000,
    requireBroker: false,
  });

  const exit = await exec.exit;

  expect(exit).toStrictEqual({ code: null, signal: '34' });
});

test('it kills an exec that outlives SIGTERM at its kill grace', async () => {
  const imp = await startFakeImp();

  const exec = await imp.port.openExec(
    'nixie-a',
    ['sh', '-c', 'trap "" TERM; echo ready; sleep 60'],
    { env: {}, killGraceMs: 100, requireBroker: false },
  );

  // the shell prints once it ignores SIGTERM
  await exec.stdout.getReader().read();

  exec.sendSignal('SIGTERM');

  const exit = await exec.exit;

  expect(exit).toStrictEqual({ code: null, signal: 'SIGKILL' });
  expect(imp.execs.at(0)?.signals).toStrictEqual(['SIGTERM']);
});

test('it rejects the exit of a session it loses on a stop, when told to', async () => {
  const imp = await startFakeImp();

  imp.failExitOnStop = true;

  const exec = await imp.port.openExec('nixie-a', ['sleep', '60'], {
    env: {},
    killGraceMs: 5000,
    requireBroker: false,
  });

  exec.sendSignal('SIGTERM');

  expect(exec.exit).rejects.toThrow('CONNECTION_CLOSED');
});

test('it listens for a reverse forward on its guest tool port and logs its stop', async () => {
  const imp = await startFakeImp();

  const forward = imp.port.openReverseForward('nixie-a', 8901, () => {});

  const port = await forward.listening;

  forward.stop();

  expect(port).toBe(imp.guestToolPort);
  expect(imp.calls).toStrictEqual(['forward nixie-a 8901', 'forward-stopped nixie-a']);
});

test('it holds a wake, an exec and a listen until an idle sleep ends, then wakes the imp once', async () => {
  const imp = await startFakeImp();

  const snapshot = Promise.withResolvers<void>();

  void imp.startIdleSleep('nixie-a', snapshot.promise);
  const wake = imp.port.wakeImp('nixie-a');

  const exec = imp.port.openExec('nixie-a', ['true'], {
    env: {},
    killGraceMs: 5000,
    requireBroker: false,
  });

  const forward = imp.port.openReverseForward('nixie-a', 8901, () => {});

  snapshot.resolve();

  await Promise.all([wake, exec, forward.listening]);

  expect(imp.calls).toStrictEqual([
    'idle-sleep nixie-a',
    'wait wake nixie-a',
    'wait exec nixie-a',
    'forward nixie-a 8901',
    'wait listen nixie-a',
    'slept nixie-a',
    'woken by wake nixie-a',
    'wake nixie-a',
  ]);
});

test('it ends each forward of the imp as lost when an idle sleep ends', async () => {
  const imp = await startFakeImp();

  const forward = imp.port.openReverseForward('nixie-a', 8901, () => {});

  await forward.listening;

  await imp.startIdleSleep('nixie-a', Promise.resolve());

  const ended = await forward.ended;

  expect(ended).toStrictEqual({ kind: 'lost' });
});

test('it starts the idle sleep set for the next wake of the imp once that wake ends', async () => {
  const imp = await startFakeImp();

  const snapshot = Promise.withResolvers<void>();

  imp.sleepsAfterWake.set('nixie-a', snapshot.promise);

  await imp.port.wakeImp('nixie-a');

  const exec = await imp.port.openExec('nixie-a', ['true'], {
    env: {},
    killGraceMs: 5000,
    requireBroker: false,
  });

  snapshot.resolve();

  await exec.started;

  expect(imp.sleepsAfterWake.size).toBe(0);

  expect(imp.calls).toStrictEqual([
    'wake nixie-a',
    'idle-sleep nixie-a',
    'wait exec nixie-a',
    'slept nixie-a',
    'woken by exec nixie-a',
  ]);
});

test('it kills each exec process group and closes each forward when the test finishes', async () => {
  const imp = await startFakeImp();

  // the shell prints its pid, which leads the exec's own process group, then becomes the sleep
  const exec = await imp.port.openExec('nixie-a', ['sh', '-c', 'echo $$; exec sleep 60'], {
    env: {},
    killGraceMs: 5000,
    requireBroker: false,
  });

  const forward = imp.port.openReverseForward('nixie-a', 8901, () => {});

  const port = await forward.listening;
  const read = await exec.stdout.getReader().read();

  const pid = Number(new TextDecoder().decode(read.value).trim());

  onTestFinished(async () => {
    await exec.exit;

    expect(() => process.kill(-pid, 0)).toThrow();

    expect(
      Bun.connect({ hostname: '127.0.0.1', port: Number(port), socket: { data: () => {} } }),
    ).rejects.toThrow();
  });

  expect(pid).toBeGreaterThan(0);
});

test('it logs an image add, then refuses it as impd does a scoped token, when told to', async () => {
  const imp = await startFakeImp();

  imp.refuseImageAdd = true;

  expect(
    imp.port.addImage({
      name: 'nixie-fetch',
      digest: `sha256:${'a'.repeat(64)}`,
      ref: `ghcr.io/example/nixie-fetch@sha256:${'a'.repeat(64)}`,
    }),
  ).rejects.toThrowWithMessage(Error, /is limited to some imps; this call is host-wide$/u);

  expect(imp.calls).toStrictEqual([
    `image nixie-fetch ghcr.io/example/nixie-fetch@sha256:${'a'.repeat(64)}`,
  ]);

  expect(imp.images.size).toBe(0);
});

test('it lists each image it holds with its digest and reference', async () => {
  const imp = await startFakeImp();

  await imp.port.addImage({
    name: 'nixie-fetch',
    digest: `sha256:${'a'.repeat(64)}`,
    ref: `ghcr.io/example/nixie-fetch@sha256:${'a'.repeat(64)}`,
  });

  const images = await imp.port.listImages();

  expect(images).toStrictEqual([
    {
      name: 'nixie-fetch',
      digest: `sha256:${'a'.repeat(64)}`,
      ref: `ghcr.io/example/nixie-fetch@sha256:${'a'.repeat(64)}`,
    },
  ]);
});
