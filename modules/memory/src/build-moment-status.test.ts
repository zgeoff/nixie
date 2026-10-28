import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { buildMomentStatus } from './build-moment-status';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const clock = buildTestClock(Date.parse('2026-10-14T11:10:00Z'));

  const memory = await startTestMemory({ logClock: clock });

  return { memory, clock };
}

test('it reads the moments of the week, who kept them and how many wait for a reflection', async () => {
  const ctx = await setupTest();

  const [message, wake] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the kettle rule stands' },
    },
    {
      kind: 'task.wake',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'morning-reading',
      payload: {},
    },
  ]);

  invariant(message && wake);

  const own = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The kettle argument',
  });

  invariant(own.status === 'written');

  await ctx.memory.store.moments.edit({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    target: { momentID: own.shortID, version: 1 },
    change: { kind: 'reflection', text: 'The noise mattered more than the price.' },
  });

  await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'morning-reading', model: 'claude-test-4' },
    thread: 'morning-reading',
    firstSequence: wake.sequence,
    lastSequence: wake.sequence,
    title: 'The headline about kettles',
  });

  const status = buildMomentStatus((at) => ctx.memory.store.moments.readWeekCount(at), null);

  const line = await status.read({
    start: { kind: 'first' },
    openedAt: new Date(ctx.clock.now()),
    times: { defaultZone: 'UTC', now: new Date(ctx.clock.now()) },
    model: 'claude-test-4',
  });

  expect(line).toStrictEqual({
    value: 2,
    text: 'Moments kept this week: 2 (1 by you, 1 by another of your tasks). 1 is waiting for a reflection.',
  });
});
