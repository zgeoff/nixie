import { expect, test } from 'bun:test';
import { runOracle, startE2ENixie } from '@heynixie/server/test-utils';

async function setupTest() {
  const nixie = await startE2ENixie({ voicePricePerMinute: 0.05 });

  return { nixie };
}

test('it reruns only the hand-off turn that a crash cut, and writes no small talk line twice', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start();

  await first.ready;

  await ctx.nixie.waitForQueueCheck();

  // the conversation's wake on the call and the call's turn both ask the model, in either order
  ctx.nixie.model.addReplies(
    { text: 'You have two things today.' },
    ...Array.from({ length: 8 }, () => ({ text: 'Noted.' })),
  );

  const callID = await first.request('placeHarnessCall', null);
  const started = await ctx.nixie.waitForRecord((record) => record.kind === 'call.started');

  const taskID = String(started.payload['taskID']);

  // the call's first step has nothing to read: it only starts the call's sandbox
  await ctx.nixie.waitForRecord(
    (record) => record.kind === 'task.step_committed' && record.stepKey === `${taskID}:1`,
  );

  await first.request('arm', { point: 'step.commit.before', kind: 'task', workID: taskID });

  await first.request('emitSpeech', {
    sessionID: 'fake-session-1',
    event: { kind: 'spoke', text: 'Morning!', heardChars: 8 },
  });

  await first.request('emitSpeech', {
    sessionID: 'fake-session-1',
    event: { kind: 'hand_off', handOffID: 'h1', request: 'my day' },
  });

  await first.waitForArrival('step.commit.before');
  await first.kill();

  const second = ctx.nixie.harness.start();

  await second.ready;

  await ctx.nixie.waitForRecord((record) => record.stepKey === `${taskID}:2`);
  await second.kill();

  const records = await ctx.nixie.readRecords();

  const thread = records.filter((record) => record.thread === taskID);

  const oracle = await runOracle(ctx.nixie);

  expect(callID).toBeString();
  expect(thread.filter((record) => record.kind === 'call.spoke')).toHaveLength(1);
  expect(thread.filter((record) => record.kind === 'call.handed_off')).toHaveLength(1);

  expect(
    thread
      .filter((record) => record.kind === 'task.step_committed')
      .map((record) => record.stepKey),
  ).toStrictEqual([`${taskID}:1`, `${taskID}:2`]);

  expect(oracle.repeatedStepKeys).toStrictEqual([]);
});
