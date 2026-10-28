import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const clock = buildTestClock(Date.parse('2026-10-14T11:10:00Z'));

  const memory = await startTestMemory({ logClock: clock });

  return { memory, clock };
}

test('it reads the title, the dated note, each labelled reflection and the linked items of a moment', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the allotment shed stays green' },
    },
  ]);

  invariant(message);

  const item = await ctx.memory.store.remember({
    text: 'Paints the shed green',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The shed colour',
  });

  invariant(kept.status === 'written');

  ctx.clock.advance(60_000);

  const reflected = await ctx.memory.store.moments.edit({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    target: { momentID: kept.momentID, version: 1 },
    change: { kind: 'reflection', text: 'The colour was about the neighbours.' },
  });

  invariant(reflected.status === 'written' && reflected.reflectionID !== undefined);

  ctx.clock.advance(60_000);

  await ctx.memory.store.moments.edit({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 2 },
    change: { kind: 'note', note: 'Green won the vote.' },
  });

  await ctx.memory.store.moments.link({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 3 },
    itemID: item.itemID,
    isLinked: true,
  });

  const view = await ctx.memory.store.moments.readView(kept.momentID);

  expect(view).toStrictEqual({
    row: expect.objectContaining({ moment_id: kept.momentID, version: 4 }),
    title: 'The shed colour',
    titleBy: 'model',
    note: { text: 'Green won the vote.', writtenAt: Date.parse('2026-10-14T11:12:00Z') },
    reflections: [
      {
        reflectionID: reflected.reflectionID,
        model: 'claude-test-4',
        createdAt: Date.parse('2026-10-14T11:11:00Z'),
        writtenAt: Date.parse('2026-10-14T11:11:00Z'),
        text: 'The colour was about the neighbours.',
      },
    ],
    linkedItemIDs: [item.itemID],
  });
});

test('it marks a title the user rewrote as written by the user', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the allotment shed stays green' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The shed colour',
  });

  invariant(kept.status === 'written');

  await ctx.memory.store.moments.edit({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 1 },
    change: { kind: 'title', title: 'Why the shed is green' },
  });

  const view = await ctx.memory.store.moments.readView(kept.momentID);

  expect(view?.title).toBe('Why the shed is green');
  expect(view?.titleBy).toBe('owner');
});

test('it reads no note for a moment that has none', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the allotment shed stays green' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The shed colour',
  });

  invariant(kept.status === 'written');

  const view = await ctx.memory.store.moments.readView(kept.shortID);

  invariant(view);

  expect(view.note).toBeNull();
});

test('it reads no view of a destroyed moment', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the allotment shed stays green' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The shed colour',
  });

  invariant(kept.status === 'written');

  await ctx.memory.store.moments.destroy({ momentID: kept.momentID, version: 1 });

  const view = await ctx.memory.store.moments.readView(kept.momentID);

  expect(view).toBeNull();
});
