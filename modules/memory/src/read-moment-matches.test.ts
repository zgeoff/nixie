import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readMomentMatches } from './read-moment-matches';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory };
}

test('it finds the oldest moment by a word that only it holds, behind more than 100 newer moments', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the pond froze over in one night' },
    },
  ]);

  invariant(message);

  await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The pond with the heron',
  });

  await Promise.all(
    Array.from({ length: 120 }, (_, index) =>
      ctx.memory.store.moments.keep({
        caller: { kind: 'owner' },
        thread: 'conversation',
        firstSequence: message.sequence,
        lastSequence: message.sequence,
        title: `Week ${String(index)} in the garden`,
      }),
    ),
  );

  const page = await readMomentMatches(ctx.memory.log, {
    words: ['heron'],
    from: null,
    to: null,
    includeRetired: false,
    before: null,
    limit: 10,
  });

  expect(page.matches.map((match) => match.title)).toStrictEqual(['The pond with the heron']);
  expect(page.next).toBeNull();
});

test('it ranks a moment that matches more of the words first', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the pond froze over in one night' },
    },
  ]);

  invariant(message);

  for (const title of ['The frozen pond', 'The heron on the frozen pond', 'A heron at dawn']) {
    await ctx.memory.store.moments.keep({
      caller: { kind: 'owner' },
      thread: 'conversation',
      firstSequence: message.sequence,
      lastSequence: message.sequence,
      title,
    });
  }

  const page = await readMomentMatches(ctx.memory.log, {
    words: ['heron', 'pond'],
    from: null,
    to: null,
    includeRetired: false,
    before: null,
    limit: 1,
  });

  expect(page.matches.map((match) => match.title)).toStrictEqual(['The heron on the frozen pond']);
});
