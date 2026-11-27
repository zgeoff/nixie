import { expect, test } from 'bun:test';
import { buildActionSeeder, createTestStep } from '@heynixie/actions/test-utils';
import { readRecords } from '@heynixie/log';
import type { TransactionBuilder } from 'kysely';
import invariant from 'tiny-invariant';
import { startTestPhone } from '../test-utils';
import type { PhoneActionAttempt } from '../types';
import { buildPhoneConnector } from './build-phone-connector';
import { phoneToolNames } from './phone-tool-names';

async function setupTest() {
  const phone = await startTestPhone();

  const connector = phone.connectors.get(phoneToolNames.send);

  invariant(connector, 'the connector of phone.send is built');

  const buildAttempt = (actionID: string) =>
    ({
      actionID,
      tool: phoneToolNames.send,
      arguments: { to: '+61400000000', body: 'Running late.' },
      attemptStartedAt: phone.clock.now(),
    }) satisfies PhoneActionAttempt;

  return {
    ...phone,
    connector,
    buildAttempt,
    seed: buildActionSeeder({ context: phone.tasks }),
    readClaims: async () => {
      const records = await readRecords(phone.tasks.log, {
        afterSequence: 0,
        kinds: ['phone.send_claimed'],
      });

      return records.map((entry) => entry.record.payload);
    },
  };
}

test('it sends the text through the provider, and claims its message for the send', async () => {
  const ctx = await setupTest();
  const response = await ctx.connector.run(ctx.buildAttempt('action-1'));
  const claims = await ctx.readClaims();

  expect(response).toStrictEqual({
    kind: 'success',
    result: { text: expect.any(String), action: 'action-1' },
  });

  expect(ctx.provider.readSent()).toStrictEqual([
    {
      messageID: expect.any(String),
      to: '+61400000000',
      body: 'Running late.',
      createdAt: ctx.clock.now(),
    },
  ]);

  expect(claims).toStrictEqual([
    {
      actionID: 'action-1',
      messageID: ctx.provider.readSent()[0]?.messageID ?? '',
      shortID: expect.any(String),
    },
  ]);
});

test('it refuses a send that the provider refuses, with the code SEND_FAILED', async () => {
  const ctx = await setupTest();

  ctx.provider.failNextSend({ kind: 'refuse', reason: 'the number cannot take texts' });

  const response = await ctx.connector.run(ctx.buildAttempt('action-1'));

  expect(response).toStrictEqual({
    kind: 'refused',
    reason: 'SEND_FAILED: the number cannot take texts',
  });
});

test('it refuses a send whose arguments it cannot read', async () => {
  const ctx = await setupTest();

  const response = await ctx.connector.run({
    actionID: 'action-1',
    tool: phoneToolNames.send,
    arguments: { to: 5 },
  });

  expect(response).toMatchObject({ kind: 'refused' });
  expect(ctx.provider.readSent()).toStrictEqual([]);
});

test('it declares a check that asks the user when the provider holds no such text', async () => {
  const ctx = await setupTest();

  expect(ctx.connector.reconcile).toStrictEqual({
    kind: 'check',
    tool: 'phone.send',
    onNotFound: 'ask',
  });
});

test('it finds a send of unknown outcome by the one unclaimed text to the same number, and claims it', async () => {
  const ctx = await setupTest();

  ctx.provider.failNextSend({ kind: 'throw_after' });

  const attempt = ctx.buildAttempt('action-1');

  await expect(ctx.connector.run(attempt)).rejects.toThrow();

  const found = await ctx.connector.check(attempt);
  const again = await ctx.connector.check(attempt);
  const claims = await ctx.readClaims();

  expect(found).toStrictEqual({
    kind: 'found',
    result: { text: expect.any(String), action: 'action-1' },
  });

  expect(again).toStrictEqual(found);
  expect(claims).toHaveLength(1);
});

test('it finds no text for a send that never reached the provider', async () => {
  const ctx = await setupTest();

  ctx.provider.failNextSend({ kind: 'throw_before' });

  const attempt = ctx.buildAttempt('action-1');

  await expect(ctx.connector.run(attempt)).rejects.toThrow();

  const response = await ctx.connector.check(attempt);

  expect(response).toStrictEqual({ kind: 'not_found' });
});

test('it never matches a text that another send claimed', async () => {
  const ctx = await setupTest();

  await ctx.connector.run(ctx.buildAttempt('action-1'));

  ctx.clock.advance(1000);

  const response = await ctx.connector.check(ctx.buildAttempt('action-2'));

  expect(response).toStrictEqual({ kind: 'inconclusive' });
});

test('it never matches a text that the check found before the attempt began', async () => {
  const ctx = await setupTest();

  ctx.provider.addSent({ to: '+61400000000', body: 'Running late.' });
  ctx.clock.advance(10 * 60_000);

  const response = await ctx.connector.check(ctx.buildAttempt('action-1'));

  expect(response).toStrictEqual({ kind: 'not_found' });
});

test('it asks the user when 2 unclaimed texts to the same number carry the body', async () => {
  const ctx = await setupTest();

  ctx.provider.addSent({ to: '+61400000000', body: 'Running late.' });
  ctx.provider.addSent({ to: '+61400000000', body: 'Running late.' });

  const response = await ctx.connector.check(ctx.buildAttempt('action-1'));

  expect(response).toStrictEqual({ kind: 'inconclusive' });
});

test('it asks the user when another send of the same number and body has begun', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.tasks);

  await ctx.seed.unknownAction({
    step,
    tool: phoneToolNames.send,
    arguments: { to: '+61400000000', body: 'Running late.' },
  });

  ctx.provider.addSent({ to: '+61400000000', body: 'Running late.' });

  const response = await ctx.connector.check(ctx.buildAttempt('action-2'));
  const claims = await ctx.readClaims();

  expect(response).toStrictEqual({ kind: 'inconclusive' });
  expect(claims).toStrictEqual([]);
});

test('it settles a send on one text even when another send of another body has begun', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.tasks);

  await ctx.seed.unknownAction({
    step,
    tool: phoneToolNames.send,
    arguments: { to: '+61400000000', body: 'A different text.' },
  });

  ctx.provider.addSent({ to: '+61400000000', body: 'Running late.' });

  const response = await ctx.connector.check(ctx.buildAttempt('action-2'));

  expect(response).toStrictEqual({
    kind: 'found',
    result: { text: expect.any(String), action: 'action-2' },
  });
});

test('it asks the user about a text that the provider created before the attempt began', async () => {
  const ctx = await setupTest();

  ctx.provider.addSent({
    to: '+61400000000',
    body: 'Running late.',
    createdAt: ctx.clock.now() - 1000,
  });

  const response = await ctx.connector.check(ctx.buildAttempt('action-1'));
  const claims = await ctx.readClaims();

  expect(response).toStrictEqual({ kind: 'inconclusive' });
  expect(claims).toStrictEqual([]);
});

test('it never sends again once its claim is written, even after a failed check', async () => {
  const ctx = await setupTest();

  const attempt = ctx.buildAttempt('action-1');

  await ctx.connector.run(attempt);

  const again = await ctx.connector.run(attempt);

  expect(again).toStrictEqual({
    kind: 'success',
    result: { text: expect.any(String), action: 'action-1' },
  });

  expect(ctx.provider.readSent()).toHaveLength(1);
});

test('it answers a check from its own claim when the provider cannot be read', async () => {
  const ctx = await setupTest();

  const attempt = ctx.buildAttempt('action-1');

  await ctx.connector.run(attempt);

  const unreadable = buildPhoneConnector({
    ...ctx.context,
    provider: {
      ...ctx.provider,
      readSentTexts: () => Promise.reject(new Error('the provider could not be reached')),
    },
  }).get(phoneToolNames.send);

  const response = await unreadable?.check(attempt);

  expect(response).toStrictEqual({
    kind: 'found',
    result: { text: expect.any(String), action: 'action-1' },
  });
});

test('it asks the user when an identical send begins after the provider is read, before the claim commits', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.tasks);

  ctx.provider.addSent({ to: '+61400000000', body: 'Running late.' });

  // Opens the other send just before the claim transaction starts, which is after the provider read
  // and after any read of the open sends made outside that transaction.
  const runAfterOtherSend = async (run: Parameters<TransactionBuilder<unknown>['execute']>[0]) => {
    await ctx.seed.unknownAction({
      step,
      tool: phoneToolNames.send,
      arguments: { to: '+61400000000', body: 'Running late.' },
    });

    return ctx.writer.db.transaction().execute(run);
  };

  const racingDB = new Proxy(ctx.writer.db, {
    get: (target, property) => {
      if (property === 'transaction') {
        return () => ({ execute: runAfterOtherSend });
      }

      const value: unknown = Reflect.get(target, property);

      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

  const racing = buildPhoneConnector({
    ...ctx.context,
    log: { ...ctx.context.log, writer: { ...ctx.context.log.writer, db: racingDB } },
  }).get(phoneToolNames.send);

  const response = await racing?.check(ctx.buildAttempt('action-2'));
  const claims = await ctx.readClaims();

  expect(response).toStrictEqual({ kind: 'inconclusive' });
  expect(claims).toStrictEqual([]);
});
