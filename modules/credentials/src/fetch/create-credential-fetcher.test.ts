import { expect, test } from 'bun:test';
import { createCredentialFetcher } from './create-credential-fetcher';

function setupTest() {
  const sends: boolean[] = [];
  const check = { isHeld: false, run: () => Promise.resolve() };

  const send = createCredentialFetcher(
    {
      resolveHost: () => Promise.resolve(['203.0.113.5']),
      checkAddress: () => true,
      transport: () => {
        sends.push(check.isHeld);

        return Promise.resolve(new Response('data'));
      },
    },
    {
      spec: null,
      readValue: () => null,
      origins: ['https://service.test'],
      options: {},
      withSendCheck: async (start) => {
        await check.run();

        check.isHeld = true;

        try {
          return start();
        } finally {
          check.isHeld = false;
        }
      },
    },
  );

  return { send, sends, check };
}

test('it hands the request off inside the send check, before the check lets go', async () => {
  const ctx = setupTest();

  const response = await ctx.send('https://service.test/data');

  expect([response.status, ctx.sends]).toStrictEqual([200, [true]]);
});

test('it sends nothing when the send check refuses', async () => {
  const ctx = setupTest();

  ctx.check.run = () => Promise.reject(new Error('the credential was removed'));

  const sending = ctx.send('https://service.test/data');

  await Promise.allSettled([sending]);

  expect(sending).rejects.toThrow('the credential was removed');
  expect(ctx.sends).toStrictEqual([]);
});

test('it reaches the paired host on an address inside its range', async () => {
  const reached: string[] = [];

  const send = createCredentialFetcher(
    {
      resolveHost: () => Promise.resolve(['10.20.4.9']),
      checkAddress: (address) => !address.startsWith('10.'),
      transport: (url) => {
        reached.push(url);

        return Promise.resolve(new Response('data'));
      },
    },
    {
      spec: null,
      readValue: () => null,
      origins: ['https://tracker.test'],
      options: { pairing: { host: 'tracker.test', range: '10.20.0.0/16' } },
    },
  );

  const response = await send('https://tracker.test/mcp');

  expect([response.status, reached]).toStrictEqual([200, ['https://tracker.test/mcp']]);
});

test('it refuses another host that resolves to a private address', async () => {
  const reached: string[] = [];

  const send = createCredentialFetcher(
    {
      resolveHost: () => Promise.resolve(['10.20.4.10']),
      checkAddress: (address) => !address.startsWith('10.'),
      transport: (url) => {
        reached.push(url);

        return Promise.resolve(new Response('data'));
      },
    },
    {
      spec: null,
      readValue: () => null,
      origins: ['https://tracker.test', 'https://other.test'],
      options: { pairing: { host: 'tracker.test', range: '10.20.0.0/16' } },
    },
  );

  const sending = send('https://other.test/mcp');

  await Promise.allSettled([sending]);

  expect(sending).rejects.toThrow('not a public address');
  expect(reached).toStrictEqual([]);
});

test('it refuses the paired host when it resolves outside the range', async () => {
  const send = createCredentialFetcher(
    {
      resolveHost: () => Promise.resolve(['10.99.0.1']),
      checkAddress: () => true,
      transport: () => Promise.resolve(new Response('data')),
    },
    {
      spec: null,
      readValue: () => null,
      origins: ['https://tracker.test'],
      options: { pairing: { host: 'tracker.test', range: '10.20.0.0/16' } },
    },
  );

  const sending = send('https://tracker.test/mcp');

  await Promise.allSettled([sending]);

  expect(sending).rejects.toThrow('not a public address');
});

test('it removes the value from each event of a stream as the event arrives', async () => {
  const encoder = new TextEncoder();

  const send = createCredentialFetcher(
    {
      resolveHost: () => Promise.resolve(['203.0.113.5']),
      checkAddress: () => true,
      transport: () => {
        const body = new ReadableStream<Uint8Array>({
          start: (controller) => {
            controller.enqueue(encoder.encode('data: {"t":"fake-stream-secret-1'));
            controller.enqueue(encoder.encode('"}\n\ndata: second\n\n'));
            controller.close();
          },
        });

        return Promise.resolve(
          new Response(body, { headers: { 'content-type': 'text/event-stream' } }),
        );
      },
    },
    {
      spec: null,
      readValue: () => 'fake-stream-secret-1',
      origins: ['https://service.test'],
      options: { stream: true },
    },
  );

  const response = await send('https://service.test/mcp');
  const text = await response.text();

  expect(text).toBe('data: {"t":"[secret removed]"}\n\ndata: second\n\n');
});
