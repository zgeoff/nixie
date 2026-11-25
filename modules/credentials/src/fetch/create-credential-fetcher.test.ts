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

  await expect(ctx.send('https://service.test/data')).rejects.toThrow('the credential was removed');

  expect(ctx.sends).toStrictEqual([]);
});
