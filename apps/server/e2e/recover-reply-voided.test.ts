import { expect, test } from 'bun:test';
import { collectUnvoidedReplies, runOracle, startE2ENixie } from '@heynixie/server/test-utils';
import invariant from 'tiny-invariant';

async function setupTest() {
  const nixie = await startE2ENixie();

  return { nixie };
}

test('it voids the reply of a crashed attempt and keeps its text out of the rerun', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start();

  await first.ready;

  await first.request('arm', { point: 'turn.reply.after' });

  ctx.nixie.model.addReplies({ text: 'Lost-reply-4KQ2' });
  void first.request('sendMessage', { thread: 'conversation', text: 'Is the kettle on?' });

  await first.waitForArrival('turn.reply.after');
  await first.kill();

  const rerunFrom = ctx.nixie.model.requests.length;

  ctx.nixie.model.addReplies({ text: 'Kept-reply-7MX9' });

  const second = ctx.nixie.harness.start();

  await second.ready;

  await ctx.nixie.advanceUntilRecord(
    10_000,
    3,
    (record) => record.kind === 'task.step_committed' && record.stepKey === 'conversation:1',
  );

  await second.kill();

  const records = await ctx.nixie.readRecords();

  const lost = records.find((record) => record.kind === 'model.reply');

  const rerunRequest = ctx.nixie.model.requests
    .slice(rerunFrom)
    .find((request) => request.path === '/v1/messages');

  invariant(lost !== undefined);
  invariant(rerunRequest?.body);

  const oracle = await runOracle(ctx.nixie);

  expect(
    records
      .filter((record) => record.kind === 'model.reply_voided')
      .map((record) => record.payload),
  ).toStrictEqual([
    { replySequence: lost.sequence, runID: 'conversation:1@1', reason: 'attempt_lost' },
  ]);

  expect(collectUnvoidedReplies(records).map((record) => record.payload['runID'])).toStrictEqual([
    'conversation:1@2',
  ]);

  expect(JSON.stringify(rerunRequest.body.messages)).not.toInclude('Lost-reply-4KQ2');
  expect(oracle.strayReplies).toStrictEqual([]);
});

test('it voids the reply of an attempt that the model API refused, and keeps its text out of the rerun', async () => {
  const ctx = await setupTest();

  const nixie = ctx.nixie.harness.start();

  await nixie.ready;

  ctx.nixie.model.addReplies(
    { text: 'Lost-reply-2VB8', toolUse: { name: 'mcp__nixie__time_now', input: {} } },
    { authFailure: 'invalid x-api-key' },
  );

  void nixie.request('sendMessage', { thread: 'conversation', text: 'What time is it?' });

  const voided = await ctx.nixie.waitForRecord((record) => record.kind === 'model.reply_voided');

  const rerunFrom = ctx.nixie.model.requests.length;

  ctx.nixie.model.addReplies({ text: 'Kept-reply-5TD1' });

  await ctx.nixie.advanceUntilRecord(
    60_000,
    5,
    (record) => record.kind === 'task.step_committed' && record.stepKey === 'conversation:1',
  );

  await nixie.kill();

  const records = await ctx.nixie.readRecords();

  const rerunRequest = ctx.nixie.model.requests
    .slice(rerunFrom)
    .find((request) => request.path === '/v1/messages');

  invariant(rerunRequest?.body);

  expect(voided.payload['reason']).toBe('attempt_failed');

  expect(collectUnvoidedReplies(records).map((record) => record.payload['runID'])).toStrictEqual([
    'conversation:1@2',
  ]);

  expect(JSON.stringify(rerunRequest.body.messages)).not.toInclude('Lost-reply-2VB8');
});
