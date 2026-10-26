import { expect, test } from 'bun:test';
import { readRecords, writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import type { MomentTables } from './moment-types';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory, db: memory.writer.db.$extendTables<MomentTables>() };
}

test('it adds a reflection labelled with the model of the call', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'never buy the cheap kettle again' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The kettle argument',
  });

  invariant(kept.status === 'written');

  const edited = await ctx.memory.store.moments.edit({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    target: { momentID: kept.shortID, version: 1 },
    change: { kind: 'reflection', text: 'Price mattered less than the noise.' },
  });

  invariant(edited.status === 'written' && edited.reflectionID !== undefined);

  const reflection = await ctx.db
    .selectFrom('moment_reflections')
    .selectAll()
    .executeTakeFirstOrThrow();

  const [record] = await readRecords(ctx.memory.log, {
    afterSequence: edited.sequence - 1,
    limit: 1,
  });

  expect(reflection).toStrictEqual({
    reflection_id: edited.reflectionID,
    moment_id: kept.momentID,
    model: 'claude-test-4',
    text_sequence: edited.sequence,
    created_at: expect.any(Number),
    updated_at: expect.any(Number),
    is_removed: 0,
  });

  expect(record?.record.erasable).toStrictEqual({
    status: 'readable',
    fields: { reflection: 'Price mattered less than the noise.' },
  });
});

test('it refuses a reflection edit from a model whose ID differs from the label', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'never buy the cheap kettle again' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The kettle argument',
  });

  invariant(kept.status === 'written');

  const reflected = await ctx.memory.store.moments.edit({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    target: { momentID: kept.shortID, version: 1 },
    change: { kind: 'reflection', text: 'Price mattered less than the noise.' },
  });

  invariant(reflected.status === 'written' && reflected.reflectionID !== undefined);

  const edited = await ctx.memory.store.moments.edit({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-5' },
    target: { momentID: kept.shortID, version: 2 },
    change: {
      kind: 'reflection',
      reflectionID: reflected.reflectionID,
      text: 'The noise was never the point.',
    },
  });

  expect(edited).toStrictEqual({ status: 'refused', reason: 'not_your_reflection' });
});

test('it lets the model named in the label edit its reflection', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'never buy the cheap kettle again' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The kettle argument',
  });

  invariant(kept.status === 'written');

  const reflected = await ctx.memory.store.moments.edit({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    target: { momentID: kept.shortID, version: 1 },
    change: { kind: 'reflection', text: 'Price mattered less than the noise.' },
  });

  invariant(reflected.status === 'written' && reflected.reflectionID !== undefined);

  const edited = await ctx.memory.store.moments.edit({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    target: { momentID: kept.shortID, version: 2 },
    change: {
      kind: 'reflection',
      reflectionID: reflected.reflectionID,
      text: 'The noise and the price both mattered.',
    },
  });

  invariant(edited.status === 'written');

  const reflections = await ctx.db
    .selectFrom('moment_reflections')
    .select(['reflection_id', 'text_sequence'])
    .execute();

  expect(reflections).toStrictEqual([
    { reflection_id: reflected.reflectionID, text_sequence: edited.sequence },
  ]);
});

test("it refuses a model's note", async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'never buy the cheap kettle again' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The kettle argument',
  });

  invariant(kept.status === 'written');

  const edited = await ctx.memory.store.moments.edit({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    target: { momentID: kept.momentID, version: 1 },
    change: { kind: 'note', note: 'This is when the kettle rule began.' },
  });

  expect(edited).toStrictEqual({ status: 'refused', reason: 'owner_only' });
});

test("it moves the note to the owner's newest note", async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'never buy the cheap kettle again' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The kettle argument',
  });

  invariant(kept.status === 'written');

  const edited = await ctx.memory.store.moments.edit({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 1 },
    change: { kind: 'note', note: 'This is when the kettle rule began.' },
  });

  invariant(edited.status === 'written');

  const row = await ctx.db
    .selectFrom('moments')
    .select(['note_sequence', 'version'])
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({ note_sequence: edited.sequence, version: 2 });
});

test('it replaces the title with the readable text of the newest title edit', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'never buy the cheap kettle again' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The kettle argument',
  });

  invariant(kept.status === 'written');

  const edited = await ctx.memory.store.moments.edit({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    target: { momentID: kept.shortID, version: 1 },
    change: { kind: 'title', title: 'The kettle rule' },
  });

  invariant(edited.status === 'written');

  const row = await ctx.db
    .selectFrom('moments')
    .select(['title_sequence', 'version'])
    .executeTakeFirstOrThrow();

  const [record] = await readRecords(ctx.memory.log, {
    afterSequence: row.title_sequence - 1,
    limit: 1,
  });

  expect(row).toStrictEqual({ title_sequence: edited.sequence, version: 2 });

  expect(record?.record.erasable).toStrictEqual({
    status: 'readable',
    fields: { title: 'The kettle rule' },
  });
});

test('it refuses an edit bound to a version the moment moved past', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'never buy the cheap kettle again' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The kettle argument',
  });

  invariant(kept.status === 'written');

  await ctx.memory.store.moments.edit({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 1 },
    change: { kind: 'title', title: 'The kettle rule' },
  });

  const edited = await ctx.memory.store.moments.edit({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    target: { momentID: kept.shortID, version: 1 },
    change: { kind: 'title', title: 'The kettle debate' },
  });

  expect(edited).toStrictEqual({ status: 'refused', reason: 'stale' });
});

test('it moves the edges of a span within its thread', async () => {
  const ctx = await setupTest();

  const [first, last] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'never buy the cheap kettle again' },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'noted, the quiet one it is' },
    },
  ]);

  invariant(first && last);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: first.sequence,
    lastSequence: first.sequence,
    title: 'The kettle argument',
  });

  invariant(kept.status === 'written');

  await ctx.memory.store.moments.edit({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    target: { momentID: kept.shortID, version: 1 },
    change: { kind: 'edges', firstSequence: first.sequence, lastSequence: last.sequence },
  });

  const row = await ctx.db
    .selectFrom('moments')
    .select(['first_sequence', 'last_sequence'])
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({ first_sequence: first.sequence, last_sequence: last.sequence });
});

test("it refuses a task's move of the edges of a conversation moment", async () => {
  const ctx = await setupTest();

  const [first, last] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'never buy the cheap kettle again' },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'noted, the quiet one it is' },
    },
  ]);

  invariant(first && last);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: first.sequence,
    lastSequence: first.sequence,
    title: 'The kettle argument',
  });

  invariant(kept.status === 'written');

  const edited = await ctx.memory.store.moments.edit({
    caller: { kind: 'model', thread: 'morning-reading', model: 'claude-test-4' },
    target: { momentID: kept.shortID, version: 1 },
    change: { kind: 'edges', firstSequence: first.sequence, lastSequence: last.sequence },
  });

  expect(edited).toStrictEqual({ status: 'refused', reason: 'other_thread' });
});

test("it lets the owner remove a model's reflection", async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'never buy the cheap kettle again' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The kettle argument',
  });

  invariant(kept.status === 'written');

  const reflected = await ctx.memory.store.moments.edit({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    target: { momentID: kept.shortID, version: 1 },
    change: { kind: 'reflection', text: 'Price mattered less than the noise.' },
  });

  invariant(reflected.status === 'written' && reflected.reflectionID !== undefined);

  await ctx.memory.store.moments.edit({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 2 },
    change: { kind: 'reflection_removed', reflectionID: reflected.reflectionID },
  });

  const reflection = await ctx.db
    .selectFrom('moment_reflections')
    .select('is_removed')
    .executeTakeFirstOrThrow();

  expect(reflection.is_removed).toBe(1);
});
