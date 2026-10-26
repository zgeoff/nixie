import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { buildMomentKeptKind } from './build-moment-kept-kind';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const clock = buildTestClock(Date.parse('2026-10-14T11:10:00Z'));

  const memory = await startTestMemory({ logClock: clock });

  return { memory, clock };
}

test("it reads a moment that another task kept with the task's name and the week's count, and leaves out the conversation's own", async () => {
  const ctx = await setupTest();

  const [message, wake] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the hedge wants trimming before the frost' },
    },
    {
      kind: 'task.wake',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'task-garden',
      payload: {},
    },
  ]);

  invariant(message && wake);

  await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The hedge before the frost',
  });

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'task-garden', model: 'claude-test-4' },
    thread: 'task-garden',
    firstSequence: wake.sequence,
    lastSequence: wake.sequence,
    title: 'The first   frost\nforecast',
  });

  invariant(kept.status === 'written');

  const kind = buildMomentKeptKind(ctx.memory.log, (taskID) => `name of ${taskID}`);

  const events = await kind.read({ after: 0, through: kept.sequence });

  expect(events).toStrictEqual([
    {
      sequence: kept.sequence,
      at: Date.parse('2026-10-14T11:10:00Z'),
      detail: {
        title: 'The first frost forecast',
        shortID: kept.shortID,
        taskName: 'name of task-garden',
        keptThisWeek: 2,
      },
    },
  ]);
});

test('it leaves out a moment whose destroy shredded its title', async () => {
  const ctx = await setupTest();

  const [wake] = await writeRecords(ctx.memory.log, [
    {
      kind: 'task.wake',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'task-garden',
      payload: {},
    },
  ]);

  invariant(wake);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'task-garden', model: 'claude-test-4' },
    thread: 'task-garden',
    firstSequence: wake.sequence,
    lastSequence: wake.sequence,
    title: 'The compost heap',
  });

  invariant(kept.status === 'written');

  await ctx.memory.store.moments.destroy({ momentID: kept.momentID, version: 1 });

  const kind = buildMomentKeptKind(ctx.memory.log, (taskID) => taskID);

  const events = await kind.read({ after: 0, through: kept.sequence });

  expect(events).toStrictEqual([]);
});

test.each([
  [
    'another task',
    'name of task-garden',
    null,
    'Another of your tasks (name of task-garden) kept a moment: "The compost heap". Moment m1. Moments kept this week: 2.',
  ],
  [
    'the owner, by name',
    null,
    'Wren',
    'Wren kept a moment: "The compost heap". Moment m1. Moments kept this week: 2.',
  ],
  [
    'the owner, with no name',
    null,
    null,
    'The owner kept a moment: "The compost heap". Moment m1. Moments kept this week: 2.',
  ],
])('it renders a moment kept by %s', async (_, taskName, ownerName, line) => {
  const ctx = await setupTest();

  const kind = buildMomentKeptKind(ctx.memory.log, (taskID) => taskID);

  expect(
    kind.render(
      { title: 'The compost heap', shortID: 'm1', taskName, keptThisWeek: 2 },
      { ownerName, timeZone: 'UTC' },
    ),
  ).toBe(line);
});
