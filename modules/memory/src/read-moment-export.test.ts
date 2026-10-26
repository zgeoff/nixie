import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readMomentExport } from './read-moment-export';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory };
}

test('it reads every moment once, oldest first, across more than one page', async () => {
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

  const titles = Array.from({ length: 23 }, (_, index) => `Bed ${String(index + 1)}`);

  for (const title of titles) {
    await ctx.memory.store.moments.keep({
      caller: { kind: 'owner' },
      thread: 'task-garden',
      firstSequence: wake.sequence,
      lastSequence: wake.sequence,
      title,
    });
  }

  const moments = await Array.fromAsync(readMomentExport(ctx.memory.log));

  expect(moments.map((moment) => ('title' in moment ? moment.title : null))).toStrictEqual(titles);
});

test("it reads a moment's span with each record's text and source", async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'plant the garlic in October' },
    },
  ]);

  invariant(message);

  await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'Garlic',
  });

  const [moment] = await Array.fromAsync(readMomentExport(ctx.memory.log));

  invariant(moment && 'records' in moment);

  expect(moment.records).toStrictEqual([
    {
      sequence: message.sequence,
      kind: 'owner_message',
      recordedAt: expect.toBeString(),
      source: 'nixie',
      text: expect.toInclude('plant the garlic in October'),
      isGap: false,
    },
  ]);
});
