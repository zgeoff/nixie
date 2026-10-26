import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readMoment } from './read-moment';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory };
}

test('it pages the reflections and then the records under one cursor, each once, every page within the cap', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the tomatoes split after the storm' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The split tomatoes',
  });

  invariant(kept.status === 'written');

  for (const version of [1, 2, 3, 4, 5]) {
    await ctx.memory.store.moments.edit({
      caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
      target: { momentID: kept.momentID, version },
      change: {
        kind: 'reflection',
        text: `${String(version)} ${'rain after drought '.repeat(220)}`,
      },
    });
  }

  const first = await readMoment(ctx.memory.log, {
    momentID: kept.shortID,
    after: null,
    tokenCap: 2500,
  });

  invariant(first !== null && first.next !== null);

  const second = await readMoment(ctx.memory.log, {
    momentID: kept.shortID,
    after: first.next,
    tokenCap: 2500,
  });

  invariant(second !== null && second.next !== null);

  const third = await readMoment(ctx.memory.log, {
    momentID: kept.shortID,
    after: second.next,
    tokenCap: 2500,
  });

  invariant(third !== null);

  const pages = [first, second, third];

  expect(pages.map((page) => page.isFirstPage)).toStrictEqual([true, false, false]);

  expect(
    pages.flatMap((page) => page.reflections.map((reflection) => reflection.text?.split(' ')[0])),
  ).toStrictEqual(['1', '2', '3', '4', '5']);

  expect(pages.flatMap((page) => page.records.map((entry) => entry.sequence))).toStrictEqual([
    message.sequence,
  ]);

  expect(third.next).toBeNull();

  expect(
    pages.map(
      (page) =>
        Math.ceil(
          JSON.stringify({
            title: page.title,
            note: page.note,
            reflections: page.reflections,
            records: page.records,
          }).length / 4,
        ) <= 2500,
    ),
  ).toStrictEqual([true, true, true]);
});

test('it cuts a note larger than the page, so the first page stays within the cap and still holds a record', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the frost took the dahlias' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The dahlias',
  });

  invariant(kept.status === 'written');

  await ctx.memory.store.moments.edit({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 1 },
    change: { kind: 'note', note: 'Lift the tubers before the first frost. '.repeat(800) },
  });

  const page = await readMoment(ctx.memory.log, {
    momentID: kept.shortID,
    after: null,
    tokenCap: 2000,
  });

  invariant(page !== null);

  const size = Math.ceil(
    JSON.stringify({ title: page.title, note: page.note, records: page.records }).length / 4,
  );

  expect(page.isNoteCut).toBeTrue();
  expect(page.note).toStartWith('Lift the tubers before the first frost.');
  expect(page.records.map((entry) => entry.sequence)).toStrictEqual([message.sequence]);
  expect(size).toBeLessThanOrEqual(2000);
});

test('it goes on from the next reflection after the user removes one the page before showed', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the tomatoes split after the storm' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The split tomatoes',
  });

  invariant(kept.status === 'written');

  const first = await ctx.memory.store.moments.edit({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    target: { momentID: kept.momentID, version: 1 },
    change: { kind: 'reflection', text: `1 ${'rain after drought '.repeat(220)}` },
  });

  invariant(first.status === 'written' && first.reflectionID !== undefined);

  for (const version of [2, 3, 4]) {
    await ctx.memory.store.moments.edit({
      caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
      target: { momentID: kept.momentID, version },
      change: {
        kind: 'reflection',
        text: `${String(version)} ${'rain after drought '.repeat(220)}`,
      },
    });
  }

  const firstPage = await readMoment(ctx.memory.log, {
    momentID: kept.shortID,
    after: null,
    tokenCap: 2500,
  });

  invariant(firstPage !== null && firstPage.next !== null);

  await ctx.memory.store.moments.edit({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 5 },
    change: { kind: 'reflection_removed', reflectionID: first.reflectionID },
  });

  const secondPage = await readMoment(ctx.memory.log, {
    momentID: kept.shortID,
    after: firstPage.next,
    tokenCap: 2500,
  });

  invariant(secondPage !== null);

  const read = (page: typeof firstPage) =>
    page.reflections.map((reflection) => reflection.text?.split(' ')[0]);

  expect(read(firstPage)).toStrictEqual(['1', '2']);
  expect(read(secondPage)).toStrictEqual(['3', '4']);
});

test('it gives the note on the first page only', async () => {
  const ctx = await setupTest();

  const sequences = await writeRecords(
    ctx.memory.log,
    Array.from({ length: 30 }, () => ({
      kind: 'model.reply' as const,
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'stake the vines before the wind '.repeat(20) },
    })),
  );

  const first = sequences.at(0);
  const last = sequences.at(-1);

  invariant(first && last);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: first.sequence,
    lastSequence: last.sequence,
    title: 'Staking the vines',
  });

  invariant(kept.status === 'written');

  await ctx.memory.store.moments.edit({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 1 },
    change: { kind: 'note', note: 'The wind came the next day.' },
  });

  const firstPage = await readMoment(ctx.memory.log, {
    momentID: kept.shortID,
    after: null,
    tokenCap: 1000,
  });

  invariant(firstPage !== null && firstPage.next !== null);

  const secondPage = await readMoment(ctx.memory.log, {
    momentID: kept.shortID,
    after: firstPage.next,
    tokenCap: 1000,
  });

  invariant(secondPage !== null);

  expect(firstPage.note).toBe('The wind came the next day.');
  expect(secondPage.note).toBeNull();
  expect(secondPage.title).toBe('Staking the vines');
});
