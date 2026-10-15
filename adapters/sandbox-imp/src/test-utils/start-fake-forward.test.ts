import { expect, mock, onTestFinished, test } from 'bun:test';
import { createServer } from 'node:net';
import invariant from 'tiny-invariant';
import { startFakeForward } from './start-fake-forward';

// a port that was free a moment ago, for the forward to listen on
async function setupTest() {
  const probe = createServer();
  const listening = Promise.withResolvers<void>();

  probe.listen(0, '127.0.0.1', listening.resolve);

  await listening.promise;

  const address = probe.address();

  probe.close();

  invariant(typeof address === 'object' && address !== null);

  return { port: address.port };
}

test("it hands the adapter's relay the data a guest sends on a connection", async () => {
  const ctx = await setupTest();

  const received = Promise.withResolvers<string>();

  const forward = startFakeForward({
    port: ctx.port,
    onConnection: (accept) => {
      accept({
        onData: (data) => {
          received.resolve(new TextDecoder().decode(data));
        },
        onEof: () => {},
        onClose: () => {},
      });
    },
    onStop: () => {},
  });

  await forward.listening;

  const socket = await Bun.connect({
    hostname: '127.0.0.1',
    port: ctx.port,
    socket: { data: () => {} },
  });

  onTestFinished(() => {
    socket.end();
  });

  socket.write('ping');

  const fromGuest = await received.promise;

  expect(fromGuest).toBe('ping');
});

test('it sends a guest the data the adapter sends on its relay', async () => {
  const ctx = await setupTest();

  const answered = Promise.withResolvers<string>();

  const forward = startFakeForward({
    port: ctx.port,
    onConnection: (accept) => {
      accept({ onData: () => {}, onEof: () => {}, onClose: () => {} }).send(
        new TextEncoder().encode('pong'),
      );
    },
    onStop: () => {},
  });

  await forward.listening;

  const socket = await Bun.connect({
    hostname: '127.0.0.1',
    port: ctx.port,
    socket: {
      data: (_socket, data) => {
        answered.resolve(new TextDecoder().decode(data));
      },
    },
  });

  onTestFinished(() => {
    socket.end();
  });

  const toGuest = await answered.promise;

  expect(toGuest).toBe('pong');
});

test('it reports a guest connection that resets as lost', async () => {
  const ctx = await setupTest();

  const closed = Promise.withResolvers<boolean>();

  const forward = startFakeForward({
    port: ctx.port,
    onConnection: (accept) => {
      accept({ onData: () => {}, onEof: () => {}, onClose: closed.resolve });
    },
    onStop: () => {},
  });

  await forward.listening;

  const socket = await Bun.connect({
    hostname: '127.0.0.1',
    port: ctx.port,
    socket: { data: () => {} },
  });

  socket.write('ping');
  socket.terminate();

  const lost = await closed.promise;

  expect(lost).toBeTrue();
});

test('it calls onStop and reports the forward stopped on a stop', async () => {
  const ctx = await setupTest();

  const onStop = mock(() => {});
  const forward = startFakeForward({ port: ctx.port, onConnection: () => {}, onStop });

  await forward.listening;

  forward.stop();

  const ended = await forward.ended;

  expect(ended).toStrictEqual({ kind: 'stopped' });
  expect(onStop).toHaveBeenCalledOnce();
});

test('it closes its listener and each guest connection and reports the forward lost on a lost stop', async () => {
  const ctx = await setupTest();

  const closed = Promise.withResolvers<void>();
  const forward = startFakeForward({ port: ctx.port, onConnection: () => {}, onStop: () => {} });

  await forward.listening;

  await Bun.connect({
    hostname: '127.0.0.1',
    port: ctx.port,
    socket: {
      data: () => {},
      close: () => {
        closed.resolve();
      },
    },
  });

  forward.stopAsLost();

  await closed.promise;

  expect(forward.ended).resolves.toStrictEqual({ kind: 'lost' });

  expect(
    Bun.connect({ hostname: '127.0.0.1', port: ctx.port, socket: { data: () => {} } }),
  ).rejects.toThrow();
});

test('it listens only once the imp is awake', async () => {
  const ctx = await setupTest();

  const awake = Promise.withResolvers<void>();

  const forward = startFakeForward({
    port: ctx.port,
    onConnection: () => {},
    onStop: () => {},
    waitForAwake: () => awake.promise,
  });

  const before = await Promise.race([forward.listening, Promise.resolve('waiting')]);

  awake.resolve();

  const port = await forward.listening;

  expect(before).toBe('waiting');
  expect(port).toBe(ctx.port);
});

test('it never listens when it ends before the imp is awake', async () => {
  const ctx = await setupTest();

  const awake = Promise.withResolvers<void>();

  const forward = startFakeForward({
    port: ctx.port,
    onConnection: () => {},
    onStop: () => {},
    waitForAwake: () => awake.promise,
  });

  forward.stop();
  awake.resolve();

  expect(forward.listening).rejects.toThrow('the forward ended as stopped before it listened');

  expect(
    Bun.connect({ hostname: '127.0.0.1', port: ctx.port, socket: { data: () => {} } }),
  ).rejects.toThrow();
});

test('it closes its listener when the test finishes', async () => {
  const ctx = await setupTest();

  const forward = startFakeForward({ port: ctx.port, onConnection: () => {}, onStop: () => {} });

  const port = await forward.listening;

  onTestFinished(() => {
    expect(
      Bun.connect({ hostname: '127.0.0.1', port: ctx.port, socket: { data: () => {} } }),
    ).rejects.toThrow();
  });

  expect(port).toBe(ctx.port);
});

test('it closes each open guest connection when the test finishes', async () => {
  const ctx = await setupTest();

  const closed = Promise.withResolvers<void>();
  const forward = startFakeForward({ port: ctx.port, onConnection: () => {}, onStop: () => {} });

  await forward.listening;

  const socket = await Bun.connect({
    hostname: '127.0.0.1',
    port: ctx.port,
    socket: {
      data: () => {},
      close: () => {
        closed.resolve();
      },
    },
  });

  onTestFinished(async () => {
    await closed.promise;

    expect(socket.readyState).not.toBe(1);
  });

  expect(socket.readyState).toBe(1);
});
