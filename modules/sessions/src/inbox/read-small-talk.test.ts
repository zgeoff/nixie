import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { readSmallTalk } from './read-small-talk';

async function setupTest() {
  const tasks = await startTestTasks({ recordsAtMs: Date.parse('2027-03-09T03:00:00Z') });

  const writeSpoke = async (text: string) => {
    await writeRecords(tasks.context.log, [
      {
        kind: 'call.spoke',
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'call-task',
        payload: {
          callID: 'c1',
          lineID: 'l1',
          speaker: 'speech_layer',
          model: 'gpt-live',
          heardChars: text.length,
        },
        erasable: { text },
      },
    ]);
  };

  const writeHandOff = async (handOffID: string) => {
    const [record] = await writeRecords(tasks.context.log, [
      {
        kind: 'call.handed_off',
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'call-task',
        payload: { callID: 'c1', handOffID, shortID: `short-${handOffID}` },
        erasable: { request: 'a request' },
      },
    ]);

    invariant(record, 'the hand-off was written');

    return record;
  };

  return { context: tasks.context, writeSpoke, writeHandOff };
}

test('it reads the small talk since the last hand-off, oldest first', async () => {
  const ctx = await setupTest();

  await ctx.writeSpoke('Before the first.');
  await ctx.writeHandOff('h1');
  await ctx.writeSpoke('Morning!');
  await ctx.writeSpoke('One sec.');

  const second = await ctx.writeHandOff('h2');
  const lines = await readSmallTalk(ctx.context, second);

  expect(lines).toStrictEqual(['Morning!', 'One sec.']);
});

test('it reads no small talk for a hand-off that follows none', async () => {
  const ctx = await setupTest();
  const first = await ctx.writeHandOff('h1');
  const lines = await readSmallTalk(ctx.context, first);

  expect(lines).toStrictEqual([]);
});

test('it reads no small talk for a record that is no hand-off', async () => {
  const ctx = await setupTest();

  await ctx.writeSpoke('Hello.');

  const [closing] = await writeRecords(ctx.context.log, [
    {
      kind: 'call.closing',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'call-task',
      payload: { callID: 'c1' },
    },
  ]);

  invariant(closing, 'the closing was written');

  const lines = await readSmallTalk(ctx.context, closing);

  expect(lines).toStrictEqual([]);
});
