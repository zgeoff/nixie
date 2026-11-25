import { expect, test } from 'bun:test';
import { CredentialRefusalError } from '@heynixie/egress';
import { startTestSite } from '@heynixie/egress/test-utils';
import type { CredentialSpec } from '../types';
import { createCredentialSocketOpener } from './create-credential-socket-opener';

async function setupTest(overrides: { readonly leak?: boolean } = {}) {
  const key = 'fake-socket-key-0001';

  const site = await startTestSite({
    names: ['live.test'],
    respond: () => new Response('not a socket', { status: 200 }),
    socket: {
      onMessage: (connection, text) => {
        const reply = overrides.leak === true ? `echo ${key}` : `echo ${text}`;

        connection.send(reply);

        if (text === 'bye') {
          connection.close();
        }
      },
    },
  });

  const origin = `https://live.test:${String(site.port)}`;
  const spec: CredentialSpec = { kind: 'static', label: 'Live', origins: [origin] };

  const open = createCredentialSocketOpener(
    { resolveHost: () => Promise.resolve(['127.0.0.1']), checkAddress: () => true, ca: site.ca },
    { spec, readValue: () => key, origins: [origin], options: {} },
  );

  return { key, site, origin, open, wssURL: `wss://live.test:${String(site.port)}/v1/live` };
}

test('it sends the credential in the handshake and exchanges text messages', async () => {
  const ctx = await setupTest();
  const socket = await ctx.open(ctx.wssURL);

  socket.send('hello');

  const first = await socket.messages[Symbol.asyncIterator]().next();

  expect(first.value).toBe('echo hello');
  expect(ctx.site.requests[0]?.headers['authorization']).toBe(`Bearer ${ctx.key}`);

  socket.close();
});

test('it carries a message past 64 KiB', async () => {
  const ctx = await setupTest();
  const socket = await ctx.open(ctx.wssURL);

  const text = 'x'.repeat(70_000);

  socket.send(text);

  const first = await socket.messages[Symbol.asyncIterator]().next();

  expect(first.value).toBe(`echo ${text}`);

  socket.close();
});

test('it cuts the credential from a message the server sends', async () => {
  const ctx = await setupTest({ leak: true });
  const socket = await ctx.open(ctx.wssURL);

  socket.send('anything');

  const first = await socket.messages[Symbol.asyncIterator]().next();

  expect(first.value).not.toContain(ctx.key);

  socket.close();
});

test('it ends the message stream when the server closes', async () => {
  const ctx = await setupTest();
  const socket = await ctx.open(ctx.wssURL);

  socket.send('bye');

  const seen: string[] = [];

  for await (const text of socket.messages) {
    seen.push(text);
  }

  expect(seen).toStrictEqual(['echo bye']);
});

test('it throws on a send after close', async () => {
  const ctx = await setupTest();
  const socket = await ctx.open(ctx.wssURL);

  socket.close();

  expect(() => {
    socket.send('late');
  }).toThrow('the socket is closed');
});

test('it refuses an origin the caller did not pass', async () => {
  const ctx = await setupTest();

  expect(ctx.open('wss://other.test/v1/live')).rejects.toThrowWithMessage(
    CredentialRefusalError,
    'https://other.test is not an origin this credential may reach',
  );
});

test('it refuses a URL that is not wss', async () => {
  const ctx = await setupTest();

  expect(ctx.open(`${ctx.origin}/v1/live`)).rejects.toThrow(CredentialRefusalError);
});

test('it refuses a URL that holds a user name', async () => {
  const ctx = await setupTest();

  expect(ctx.open(`wss://name:word@live.test:${String(ctx.site.port)}/x`)).rejects.toThrow(
    CredentialRefusalError,
  );
});

test('it rejects an answer that is not an upgrade, with no key in the error', async () => {
  const ctx = await setupTest();
  const plain = await startTestSite({ names: ['live.test'], respond: () => new Response('no') });

  const origin = `https://live.test:${String(plain.port)}`;

  const open = createCredentialSocketOpener(
    { resolveHost: () => Promise.resolve(['127.0.0.1']), checkAddress: () => true, ca: plain.ca },
    {
      spec: { kind: 'static', label: 'Live', origins: [origin] },
      readValue: () => ctx.key,
      origins: [origin],
      options: {},
    },
  );

  expect(open(`wss://live.test:${String(plain.port)}/x`)).rejects.toThrow('in place of an upgrade');
});

test('it refuses a host that resolves to an address the check denies', async () => {
  const ctx = await setupTest();

  const open = createCredentialSocketOpener(
    { resolveHost: () => Promise.resolve(['10.0.0.5']), checkAddress: () => false },
    {
      spec: { kind: 'static', label: 'Live', origins: [ctx.origin] },
      readValue: () => ctx.key,
      origins: [ctx.origin],
      options: {},
    },
  );

  expect(open(ctx.wssURL)).rejects.toThrow(CredentialRefusalError);
});
