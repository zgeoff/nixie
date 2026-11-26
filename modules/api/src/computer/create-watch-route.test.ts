import { expect, onTestFinished, test } from 'bun:test';
import { sessionCookieName } from '@heynixie/contract';
import { readDeviceByIdentity } from '@heynixie/devices';
import { readRecords } from '@heynixie/log';
import { nativeWebSocket, waitForCondition } from '@heynixie/testing';
import { z } from 'zod';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';
import { defaultAPISettings } from '../utils/default-api-settings';
import { watchTicketLifetimeMs } from './create-watch-tickets';

interface FakeWatch {
  readonly send: (bytes: Uint8Array) => void;
  readonly close: () => void;
  readonly received: Uint8Array[];
  readonly state: { isEnded: boolean };
}

async function setupTest() {
  const api = await startTestAPI(defaultAPISettings);
  const owner = await createDeviceSession(api.context, 'laptop');

  const watches: FakeWatch[] = [];

  api.setWatch((socket) => {
    const watch: FakeWatch = {
      send: socket.send,
      close: socket.close,
      received: [],
      state: { isEnded: false },
    };

    watches.push(watch);

    return {
      releaseInput: () => {},
      closeAfterRelease: () => {},
      receive: (bytes) => {
        watch.received.push(bytes);
      },
      end: () => {
        watch.state.isEnded = true;
      },
    };
  });

  const NativeWebSocket = nativeWebSocket;
  const keyBytes = crypto.getRandomValues(new Uint8Array(16));
  const socketKey = Buffer.from(keyBytes).toString('base64');
  const wsURL = (path: string) => `ws://127.0.0.1:${new URL(api.url).port}${path}`;
  const httpURL = (path: string) => `${api.url}${path}`;

  return {
    ...api,
    owner,
    watches,
    mint: async (token: string = owner.token) => {
      const watch = await buildTestClient(api.url, token).computer.watch({
        clientActionID: crypto.randomUUID(),
      });

      return watch.streamURL;
    },
    connect: (path: string, token: string | null = owner.token) => {
      const messages: Uint8Array[] = [];
      const closed = Promise.withResolvers<{ code: number }>();
      const opened = Promise.withResolvers<void>();

      const socket = new NativeWebSocket(wsURL(path), {
        headers: token === null ? {} : { cookie: `${sessionCookieName}=${token}` },
      });

      socket.binaryType = 'arraybuffer';

      socket.addEventListener('open', () => {
        opened.resolve();
      });

      socket.addEventListener('message', (event) => {
        messages.push(new Uint8Array(z.instanceof(ArrayBuffer).parse(event.data)));
      });

      socket.addEventListener('close', (event) => {
        closed.resolve({ code: event.code });
      });

      onTestFinished(() => {
        socket.close();
      });

      return { socket, messages, closed: closed.promise, opened: opened.promise };
    },
    tryBearerUpgrade: (path: string, token: string) =>
      fetch(httpURL(path), {
        headers: {
          upgrade: 'websocket',
          connection: 'Upgrade',
          'sec-websocket-version': '13',
          'sec-websocket-key': socketKey,
          authorization: `Bearer ${token}`,
        },
      }),
    tryUpgrade: (path: string, token: string | null = owner.token) =>
      fetch(httpURL(path), {
        headers: {
          upgrade: 'websocket',
          connection: 'Upgrade',
          'sec-websocket-version': '13',
          'sec-websocket-key': socketKey,
          ...(token === null ? {} : { cookie: `${sessionCookieName}=${token}` }),
        },
      }),
    readRecordCount: async () => {
      const records = await readRecords(api.context.log, { afterSequence: 0 });

      return records.length;
    },
  };
}

test('it relays the desktop stream to the browser and the viewer bytes to the watch', async () => {
  const ctx = await setupTest();
  const url = await ctx.mint();

  const browser = ctx.connect(url);

  await browser.opened;
  await waitForCondition(() => ctx.watches.length === 1);

  ctx.watches[0]?.send(new Uint8Array([1, 2, 3]));
  browser.socket.send(new Uint8Array([9, 8]));

  await waitForCondition(
    () => browser.messages.length === 1 && ctx.watches[0]?.received.length === 1,
  );

  expect([browser.messages, ctx.watches[0]?.received]).toStrictEqual([
    [new Uint8Array([1, 2, 3])],
    [new Uint8Array([9, 8])],
  ]);
});

test('it ends the watch when the browser closes the socket', async () => {
  const ctx = await setupTest();
  const url = await ctx.mint();

  const browser = ctx.connect(url);

  await browser.opened;
  await waitForCondition(() => ctx.watches.length === 1);

  browser.socket.close();

  await waitForCondition(() => ctx.watches[0]?.state.isEnded === true);

  expect(ctx.watches[0]?.state.isEnded).toBe(true);
});

test('it closes the socket when the watch closes it', async () => {
  const ctx = await setupTest();
  const url = await ctx.mint();

  const browser = ctx.connect(url);

  await browser.opened;
  await waitForCondition(() => ctx.watches.length === 1);

  ctx.watches[0]?.close();

  const closed = await browser.closed;

  expect(closed.code).toBe(1000);
});

test('it opens one socket per ticket, and refuses the second use with a 401 and no body', async () => {
  const ctx = await setupTest();
  const url = await ctx.mint();

  const browser = ctx.connect(url);

  await browser.opened;
  await waitForCondition(() => ctx.watches.length === 1);

  const second = await ctx.tryUpgrade(url);

  expect([second.status, await second.text(), ctx.watches.length]).toStrictEqual([401, '', 1]);
});

test('it refuses a ticket after its 30 seconds', async () => {
  const ctx = await setupTest();
  const url = await ctx.mint();

  ctx.clock.advance(watchTicketLifetimeMs + 1);

  const late = await ctx.tryUpgrade(url);

  expect([late.status, await late.text(), ctx.watches.length]).toStrictEqual([401, '', 0]);
});

test('it opens a socket at the last moment of the ticket', async () => {
  const ctx = await setupTest();
  const url = await ctx.mint();

  ctx.clock.advance(watchTicketLifetimeMs);

  const browser = ctx.connect(url);

  await browser.opened;
  await waitForCondition(() => ctx.watches.length === 1);

  expect(ctx.watches).toHaveLength(1);
});

test('it refuses a ticket it never minted', async () => {
  const ctx = await setupTest();
  const unknown = await ctx.tryUpgrade('/rpc/computer/watch-stream?ticket=AAAA');

  expect([unknown.status, await unknown.text()]).toStrictEqual([401, '']);
});

test('it refuses a call with no ticket', async () => {
  const ctx = await setupTest();
  const none = await ctx.tryUpgrade('/rpc/computer/watch-stream');

  expect(none.status).toBe(401);
});

test('it refuses a ticket from a browser with no session cookie, wakes nothing and spends the ticket', async () => {
  const ctx = await setupTest();
  const url = await ctx.mint();
  const signedOut = await ctx.tryUpgrade(url, null);
  const retried = await ctx.tryUpgrade(url);

  expect([signedOut.status, retried.status, ctx.watches.length]).toStrictEqual([401, 401, 0]);
});

test('it refuses a ticket that its own bearer token presents with no cookie', async () => {
  const ctx = await setupTest();
  const url = await ctx.mint();
  const bearer = await ctx.tryBearerUpgrade(url, ctx.owner.token);

  expect([bearer.status, await bearer.text(), ctx.watches.length]).toStrictEqual([401, '', 0]);
});

test('it refuses a ticket that another session presents', async () => {
  const ctx = await setupTest();
  const other = await createDeviceSession(ctx.context, 'phone');
  const url = await ctx.mint();
  const crossed = await ctx.tryUpgrade(url, other.token);

  expect([crossed.status, ctx.watches.length]).toStrictEqual([401, 0]);
});

test('it refuses a ticket whose session was revoked after the call', async () => {
  const ctx = await setupTest();
  const other = await createDeviceSession(ctx.context, 'phone');
  const url = await ctx.mint(other.token);

  await buildTestClient(ctx.url, ctx.owner.token).sessions.revoke({
    clientActionID: crypto.randomUUID(),
    sessionID: other.sessionID,
  });

  const revoked = await ctx.tryUpgrade(url, other.token);

  expect([revoked.status, ctx.watches.length]).toStrictEqual([401, 0]);
});

test('it never writes the ticket to a log line', async () => {
  const ctx = await setupTest();
  const other = await createDeviceSession(ctx.context, 'phone');
  const refusedURL = await ctx.mint();
  const openedURL = await ctx.mint();

  const tickets = [refusedURL, openedURL].map((url) => url.split('ticket=')[1] ?? '');

  await ctx.tryUpgrade(refusedURL, other.token);

  const browser = ctx.connect(openedURL);

  await browser.opened;
  await waitForCondition(() => ctx.watches.length === 1);

  browser.socket.close();

  await waitForCondition(() => ctx.watches[0]?.state.isEnded === true);

  const logged = ctx.logged.join('\n');

  expect([
    ctx.logged.length > 0,
    ...tickets.map((ticket) => logged.includes(ticket)),
  ]).toStrictEqual([true, false, false]);
});

test('it writes no record for a watch', async () => {
  const ctx = await setupTest();
  const url = await ctx.mint();
  const before = await ctx.readRecordCount();

  const browser = ctx.connect(url);

  await browser.opened;
  await waitForCondition(() => ctx.watches.length === 1);

  browser.socket.send(new Uint8Array([1]));
  browser.socket.close();

  await waitForCondition(() => ctx.watches[0]?.state.isEnded === true);

  const after = await ctx.readRecordCount();

  expect(after).toBe(before);
});

test('it ends the watch and closes the socket when its session is revoked', async () => {
  const ctx = await setupTest();
  const other = await createDeviceSession(ctx.context, 'phone');
  const url = await ctx.mint(other.token);

  const browser = ctx.connect(url, other.token);

  await browser.opened;
  await waitForCondition(() => ctx.watches.length === 1);

  await buildTestClient(ctx.url, ctx.owner.token).sessions.revoke({
    clientActionID: crypto.randomUUID(),
    sessionID: other.sessionID,
  });

  await waitForCondition(() => ctx.watches[0]?.state.isEnded === true);

  const closed = await browser.closed;

  expect(closed.code).toBe(1008);
});

test('it closes the watch socket and removes the device row when a full session with a device is revoked', async () => {
  const ctx = await setupTest();
  const other = await createDeviceSession(ctx.context, 'phone');

  const otherClient = buildTestClient(ctx.url, other.token);

  await otherClient.devices.register({ clientActionID: crypto.randomUUID(), name: 'kitchen tab' });

  const url = await ctx.mint(other.token);

  const browser = ctx.connect(url, other.token);

  await browser.opened;
  await waitForCondition(() => ctx.watches.length === 1);

  await buildTestClient(ctx.url, ctx.owner.token).sessions.revoke({
    clientActionID: crypto.randomUUID(),
    sessionID: other.sessionID,
  });

  await waitForCondition(() => ctx.watches[0]?.state.isEnded === true);

  const closed = await browser.closed;
  const device = await readDeviceByIdentity(ctx.context.log.writer.db, other.sessionID);

  expect([closed.code, ctx.watches[0]?.state.isEnded, device]).toStrictEqual([1008, true, null]);
});

test('it ends the watch and closes the socket when its session lapses past the idle limit', async () => {
  const ctx = await setupTest();
  const url = await ctx.mint();

  const browser = ctx.connect(url);

  await browser.opened;
  await waitForCondition(() => ctx.watches.length === 1);

  ctx.clock.advance(defaultAPISettings.sessionIdleMs + 1);

  await waitForCondition(() => ctx.watches[0]?.state.isEnded === true);

  const closed = await browser.closed;

  expect(closed.code).toBe(1008);
});

test('it closes a socket that sends text, which the desktop protocol never uses', async () => {
  const ctx = await setupTest();
  const url = await ctx.mint();

  const browser = ctx.connect(url);

  await browser.opened;

  browser.socket.send('hello');

  const closed = await browser.closed;

  expect(closed.code).toBe(1003);
});

test('it closes the socket when the server holds no computer', async () => {
  const ctx = await setupTest();
  const url = await ctx.mint();

  ctx.setWatch(null);

  const browser = ctx.connect(url);

  const closed = await browser.closed;

  expect(closed.code).toBe(1011);
});
