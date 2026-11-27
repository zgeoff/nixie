import { expect, test } from 'bun:test';
import type { FakeSendFault } from './build-fake-phone-provider';
import { buildFakePhoneProvider } from './build-fake-phone-provider';

function setupTest() {
  let nowMs = 1_000_000;

  return {
    provider: buildFakePhoneProvider({ now: () => nowMs }),
    advance: (durationMs: number) => {
      nowMs += durationMs;
    },
  };
}

test('it reads the inbound texts at or after a time, oldest first', async () => {
  const ctx = setupTest();

  ctx.provider.deliver({ from: 'A', body: 'late', receivedAt: 3000 });
  ctx.provider.deliver({ from: 'B', body: 'early', receivedAt: 1000 });
  ctx.provider.deliver({ from: 'C', body: 'middle', receivedAt: 2000 });

  const texts = await ctx.provider.readInbound(2000);

  expect(texts.map((text) => text.body)).toStrictEqual(['middle', 'late']);
});

test('it reads every text of the newest time as the recent texts, however many there are', async () => {
  const ctx = setupTest();

  ctx.provider.deliver({ from: 'A', body: 'old', receivedAt: 1000 });

  for (let count = 0; count < 25; count += 1) {
    ctx.provider.deliver({ from: 'A', body: `new ${String(count)}`, receivedAt: 2000 });
  }

  const texts = await ctx.provider.readRecent();

  expect(texts).toHaveLength(25);
  expect(texts.map((text) => text.receivedAt)).toSatisfyAll((receivedAt) => receivedAt === 2000);
});

test('it reads no recent text from an empty inbox', async () => {
  const ctx = setupTest();

  const texts = await ctx.provider.readRecent();

  expect(texts).toStrictEqual([]);
});

test('it sends a text and finds it by number, body and window', async () => {
  const ctx = setupTest();

  const sent = await ctx.provider.send({ to: '+61400000000', body: 'Hi' });

  const found = await ctx.provider.readSentTexts({
    to: '+61400000000',
    body: 'Hi',
    fromMs: 900_000,
    untilMs: 1_100_000,
  });

  const other = await ctx.provider.readSentTexts({
    to: '+61400000001',
    body: 'Hi',
    fromMs: 900_000,
    untilMs: 1_100_000,
  });

  expect(sent.kind).toBe('sent');
  expect(found).toHaveLength(1);
  expect(other).toStrictEqual([]);
});

test.each<[string, FakeSendFault, 'fulfilled' | 'rejected', number]>([
  ['refuse', { kind: 'refuse', reason: 'no' }, 'fulfilled', 0],
  ['throw_before', { kind: 'throw_before' }, 'rejected', 0],
  ['throw_after', { kind: 'throw_after' }, 'rejected', 1],
])(
  'it makes the next send fail with %s, and creates %i texts',
  async (_name, fault, status, created) => {
    const ctx = setupTest();

    ctx.provider.failNextSend(fault);

    const [result] = await Promise.allSettled([
      ctx.provider.send({ to: '+61400000000', body: 'Hi' }),
    ]);

    expect(result.status).toBe(status);
    expect(ctx.provider.readSent()).toHaveLength(created);
  },
);

test('it makes the next read throw once', async () => {
  const ctx = setupTest();

  ctx.provider.failNextRead('down');

  const [first] = await Promise.allSettled([ctx.provider.readInbound(0)]);
  const [second] = await Promise.allSettled([ctx.provider.readInbound(0)]);

  expect([first.status, second.status]).toStrictEqual(['rejected', 'fulfilled']);
});
