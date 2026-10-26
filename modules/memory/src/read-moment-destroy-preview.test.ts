import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readMomentDestroyPreview } from './read-moment-destroy-preview';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory };
}

test('it previews the texts and links a destroy shreds and the span records it keeps', async () => {
  const ctx = await setupTest();

  const [message, reply] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the bees swarmed into the hollow ash' },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Call the beekeeper before dusk.' },
    },
  ]);

  invariant(message && reply);

  const item = await ctx.memory.store.remember({
    text: 'Keeps bees at the allotment',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: reply.sequence,
    title: 'The swarm',
  });

  invariant(kept.status === 'written');

  await ctx.memory.store.moments.edit({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 1 },
    change: { kind: 'title', title: 'The swarm in the ash' },
  });

  await ctx.memory.store.moments.link({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 2 },
    itemID: item.itemID,
    isLinked: true,
  });

  const read = await readMomentDestroyPreview(ctx.memory.log, {
    momentID: kept.shortID,
    version: 3,
  });

  expect(read).toStrictEqual({
    status: 'ready',
    preview: {
      momentID: kept.momentID,
      shortID: kept.shortID,
      version: 3,
      state: 'active',
      thread: 'conversation',
      keptBy: 'owner',
      keptAt: expect.any(Number),
      title: 'The swarm in the ash',
      note: null,
      reflections: [],
      lost: { texts: 2, links: 1 },
      kept: { records: 2 },
    },
  });
});

test('it refuses a preview bound to a version the moment moved past', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the bees swarmed into the hollow ash' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The swarm',
  });

  invariant(kept.status === 'written');

  const read = await readMomentDestroyPreview(ctx.memory.log, {
    momentID: kept.momentID,
    version: 2,
  });

  expect(read).toStrictEqual({ status: 'refused', reason: 'stale' });
});

test('it never pairs the version it checked with a reflection added after it, when an edit commits during the preview', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the bees swarmed into the hollow ash' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The swarm',
  });

  invariant(kept.status === 'written');

  const [read] = await Promise.all([
    readMomentDestroyPreview(ctx.memory.log, { momentID: kept.momentID, version: 1 }),
    ctx.memory.store.moments.edit({
      caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
      target: { momentID: kept.shortID, version: 1 },
      change: { kind: 'reflection', text: 'The ash was hollow for years.' },
    }),
  ]);

  expect(read).toMatchObject({
    status: 'ready',
    preview: { version: 1, reflections: [], lost: { texts: 1, links: 0 } },
  });
});

test('it refuses a preview of a moment that does not exist', async () => {
  const ctx = await setupTest();

  const read = await readMomentDestroyPreview(ctx.memory.log, {
    momentID: 'no-such-moment',
    version: 1,
  });

  expect(read).toStrictEqual({ status: 'refused', reason: 'not_found' });
});
