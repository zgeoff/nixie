import { expect, test } from 'bun:test';
import { makeKeyedFetch } from '@heynixie/egress/test-utils';
import { network } from '@heynixie/mock-server';
import { HttpResponse, http } from 'msw';
import { buildTwilioPhone } from './build-twilio-phone';
import { twilioAPIURL } from './mocks/twilio-api-url';
import { twilioStore } from './mocks/twilio-store';

async function setupTest() {
  await twilioStore.keys.create({ accountSID: 'ACtest', keySID: 'SKtest', secret: 'secret-a' });

  const basic = Buffer.from('SKtest:secret-a').toString('base64');

  return {
    provider: buildTwilioPhone({
      fetch: makeKeyedFetch('authorization', `Basic ${basic}`),
      apiURL: twilioAPIURL,
      accountSID: 'ACtest',
      number: '+61411111111',
    }),
  };
}

test('it reads the newest texts that the number received, newest first, and leaves out the ones it sent', async () => {
  const ctx = await setupTest();

  await twilioStore.messages.create({ sid: 'SM1', from: 'Example', body: 'First', sentAt: 1000 });

  await twilioStore.messages.create({
    sid: 'SM2',
    from: '+61422222222',
    body: 'Second',
    sentAt: 2000,
  });

  await twilioStore.messages.create({
    sid: 'SM3',
    from: '+61411111111',
    to: '+61400000000',
    body: 'Sent',
    direction: 'outbound-api',
    sentAt: 3000,
  });

  const texts = await ctx.provider.readRecent();

  expect(texts).toStrictEqual([
    { messageID: 'SM2', from: '+61422222222', receivedAt: 2000, body: 'Second' },
    { messageID: 'SM1', from: 'Example', receivedAt: 1000, body: 'First' },
  ]);
});

test('it reads each text at or after a time, oldest first, across every page', async () => {
  const ctx = await setupTest();

  for (let index = 0; index < 120; index += 1) {
    await twilioStore.messages.create({
      sid: `SM${String(index).padStart(3, '0')}`,
      body: `Text ${String(index)}`,
      sentAt: Date.UTC(2027, 2, 9, 0, 0, index),
    });
  }

  const texts = await ctx.provider.readInbound(Date.UTC(2027, 2, 9, 0, 0, 10));

  expect(texts).toHaveLength(110);
  expect(texts[0]?.messageID).toBe('SM010');
  expect(texts.at(-1)?.messageID).toBe('SM119');
});

test('it sends a text from its own number and answers with the message ID', async () => {
  const ctx = await setupTest();
  const sent = await ctx.provider.send({ to: '+61400000000', body: 'Running 10 minutes late.' });

  const held = twilioStore.messages.findMany((query) => query.where({ direction: 'outbound-api' }));

  expect(sent).toStrictEqual({ kind: 'sent', messageID: held[0]?.sid ?? '' });

  expect(held).toMatchObject([
    { from: '+61411111111', to: '+61400000000', body: 'Running 10 minutes late.' },
  ]);
});

test('it refuses a send that Twilio refuses with a client error, with its message', async () => {
  const ctx = await setupTest();

  network.use(
    http.post(`${twilioAPIURL}/2010-04-01/Accounts/ACtest/Messages.json`, () =>
      HttpResponse.json(
        { code: 21_211, message: 'Invalid To number', status: 400 },
        { status: 400 },
      ),
    ),
  );

  const sent = await ctx.provider.send({ to: '+61400000000', body: 'Hi' });

  expect(sent).toStrictEqual({ kind: 'refused', reason: 'Invalid To number' });
});

test.each([500, 429])(
  'it throws on a send that Twilio answers with %i, because the text may have gone out',
  async (status) => {
    const ctx = await setupTest();

    network.use(
      http.post(
        `${twilioAPIURL}/2010-04-01/Accounts/ACtest/Messages.json`,
        () => new HttpResponse(null, { status }),
      ),
    );

    const [result] = await Promise.allSettled([
      ctx.provider.send({ to: '+61400000000', body: 'Hi' }),
    ]);

    expect(result.status).toBe('rejected');
  },
);

test('it finds the texts that it sent to one number with one body in a window', async () => {
  const ctx = await setupTest();

  const base = { from: '+61411111111', direction: 'outbound-api' } as const;

  await twilioStore.messages.create({
    ...base,
    sid: 'SM1',
    to: '+61400000000',
    body: 'Hi',
    sentAt: 5000,
  });

  await twilioStore.messages.create({
    ...base,
    sid: 'SM2',
    to: '+61400000000',
    body: 'Hi',
    sentAt: 50_000,
  });

  await twilioStore.messages.create({
    ...base,
    sid: 'SM3',
    to: '+61400000000',
    body: 'Other',
    sentAt: 5000,
  });

  await twilioStore.messages.create({
    ...base,
    sid: 'SM4',
    to: '+61433333333',
    body: 'Hi',
    sentAt: 5000,
  });

  const found = await ctx.provider.readSentTexts({
    to: '+61400000000',
    body: 'Hi',
    fromMs: 1000,
    untilMs: 10_000,
  });

  expect(found).toStrictEqual([{ messageID: 'SM1' }]);
});

test('it throws when the API key is wrong', async () => {
  const ctx = await setupTest();

  await twilioStore.keys.clear();

  const [result] = await Promise.allSettled([ctx.provider.readRecent()]);

  expect(result.status).toBe('rejected');
});

test('it reads the list of the number in one request with the day filter left out of a recent read', async () => {
  const ctx = await setupTest();

  await ctx.provider.readRecent();

  const requests = twilioStore.requests.findMany((query) => query.where({}));

  expect(requests.map((request) => request.method)).toStrictEqual(['GET']);
  expect(requests[0]?.search).toBe('?To=%2B61411111111&PageSize=20');
});
