import { expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  createTestClient,
  sendClientMessage,
  startInProcessNixie,
} from '@heynixie/server/test-utils';
import invariant from 'tiny-invariant';

// An age of under a millisecond, so every payload that the first run wrote is old at the next start.
async function setupTest() {
  const nixie = await startInProcessNixie({
    hasStarterRules: false,
    extraConfig: ['erasure:', '  expire_after_days: 0.00000001'],
    beforeStart: async (files) => {
      const definitions = join(dirname(files.configPath), 'definitions');

      await writeFile(join(definitions, 'nixie.yaml'), 'format: 3\n');
      await mkdir(join(definitions, 'rules'));

      await writeFile(
        join(definitions, 'rules', 'start.yaml'),
        'allow-tools:\n  outcome: allow\n  tools: [time.now, log.forget]\n',
      );
    },
  });

  await nixie.waitForLogEvent('ready');

  const api = await createTestClient(nixie);

  nixie.guest.addKindReplies('conversation', { text: 'Noted.' });

  const sent = await sendClientMessage(
    api.client,
    { text: 'The shed key is under the pot.' },
    'Noted.',
  );

  const reply = sent.find((record) => record.kind === 'model.reply');

  invariant(reply, 'the first reply is in the thread');

  nixie.guest.addKindReplies(
    'conversation',
    { toolUse: { name: 'time.now', input: {} } },
    { toolUse: { name: 'log.forget', input: { record: String(reply.sequence) } } },
    { text: 'Removed it.' },
  );

  await sendClientMessage(
    api.client,
    { text: 'What time is it? Then forget your reply.' },
    'Removed it.',
  );

  return { nixie };
}

test('it expires the tool result and the connector result of a past run at the next start, and leaves the owner message', async () => {
  const ctx = await setupTest();

  ctx.nixie.signalStop();

  const first = await ctx.nixie.waitForExit();

  const again = ctx.nixie.startAgain();

  await again.waitForLogEvent('expiry.finished');

  again.signalStop();

  const second = await again.waitForExit();

  const isForgetOutcome = (record: (typeof first.records)[number]) =>
    record.kind === 'action.outcome' && record.payload['tool'] === 'log.forget';

  const expirable = first.records.filter(
    (record) =>
      (record.kind === 'tool_result' || isForgetOutcome(record)) &&
      record.erasable.status === 'readable',
  );

  const owner = first.records.filter((record) => record.kind === 'owner_message');

  const statusOf = (sequence: number) =>
    second.records.find((record) => record.sequence === sequence)?.erasable.status;

  expect(
    first.records
      .filter(isForgetOutcome)
      .map((record) => [record.payload['status'], record.erasable.status]),
  ).toStrictEqual([['done', 'readable']]);

  expect(new Set(expirable.map((record) => record.kind))).toStrictEqual(
    new Set(['tool_result', 'action.outcome']),
  );

  expect(expirable.map((record) => statusOf(record.sequence))).toSatisfyAll(
    (status) => status === 'shredded',
  );

  expect(owner.map((record) => statusOf(record.sequence))).toSatisfyAll(
    (status) => status === 'readable',
  );
});
