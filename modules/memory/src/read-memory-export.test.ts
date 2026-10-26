import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { memoryExportSchema } from './memory-export-schema';
import type { TestMemoryOptions } from './test-utils/start-test-memory';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest(config: TestMemoryOptions = {}) {
  onTestFinished(() => {
    setSystemTime();
  });

  const memory = await startTestMemory(config);

  return {
    memory,
    readExportText: async (exportedAt: number) => {
      const chunks = await Array.fromAsync(memory.store.view.readExport({ exportedAt }));

      return chunks.join('');
    },
  };
}

test('it exports a self-note with its subject', async () => {
  const ctx = await setupTest();

  await ctx.memory.store.remember({
    text: 'I like ending a long answer with a short summary line',
    subject: 'self',
    provenance: {
      origin: 'conversation',
      source: 'untrusted',
      taskID: 'conversation',
      proposalID: null,
      checks: { tokens: 'pass' },
      model: 'claude-opus-5-5',
    },
  });

  const text = await ctx.readExportText(Date.parse('2026-10-14T08:00:00.000Z'));

  expect(memoryExportSchema.safeParse(JSON.parse(text)).data?.items).toMatchObject([
    {
      subject: 'self',
      versions: [{ text: 'I like ending a long answer with a short summary line' }],
    },
  ]);
});

test('it exports an active item with its text, its quote and its provenance, and the file matches the schema', async () => {
  const ctx = await setupTest();

  setSystemTime(new Date('2026-10-12T09:00:00.000Z'));

  const item = await ctx.memory.store.remember({
    text: 'Rents allotment plot 14',
    evidenceQuote: 'the allotment plot is number 14',
    provenance: {
      origin: 'memory_writer',
      source: 'owner',
      taskID: 'memory-writer',
      proposalID: null,
      checks: { checker: { verdict: 'asserted', model: 'checker-model-1', failure: null } },
      model: 'writer-model-1',
    },
  });

  const text = await ctx.readExportText(Date.parse('2026-10-14T08:00:00.000Z'));

  expect(memoryExportSchema.safeParse(JSON.parse(text)).data?.items).toStrictEqual([
    {
      itemID: item.itemID,
      shortID: expect.toBeString(),
      state: 'active',
      isPinned: false,
      subject: 'owner',
      versions: [
        {
          version: 1,
          change: 'created',
          state: 'active',
          text: 'Rents allotment plot 14',
          evidenceQuote: 'the allotment plot is number 14',
          until: null,
          provenance: {
            origin: 'memory_writer',
            source: 'owner',
            taskID: 'memory-writer',
            proposalID: null,
            checks: { checker: { verdict: 'asserted', model: 'checker-model-1', failure: null } },
            writerModel: 'writer-model-1',
            checkerModel: 'checker-model-1',
            snapshotHash: 'sha256:test',
            recordedAt: '2026-10-12T09:00:00.000Z',
          },
        },
      ],
    },
  ]);
});

test("it exports the writer's model from the batch that applied a version whose row holds none", async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.memory.log, [
    {
      kind: 'memory.writer_started',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: { startSequence: 0, at: 1_000_000 },
    },
  ]);

  const item = await ctx.memory.store.remember({
    text: 'Rents allotment plot 14',
    provenance: {
      origin: 'memory_writer',
      source: 'owner',
      taskID: 'memory-writer',
      proposalID: null,
      checks: null,
      thread: 'memory-writer',
    },
  });

  await writeRecords(ctx.memory.log, [
    {
      kind: 'memory.batch_published',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: {
        start: 0,
        end: 1,
        mode: 'catch_up',
        at: 1_000_000,
        applied: [{ itemID: item.itemID, version: 1 }],
        proposed: 0,
        dropped: 0,
        catchUpEnded: false,
        model: 'writer-model-1',
        profile: 'writer-direct',
        usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
      },
    },
  ]);

  const text = await ctx.readExportText(Date.parse('2026-10-14T08:00:00.000Z'));

  expect(memoryExportSchema.safeParse(JSON.parse(text)).data?.items).toMatchObject([
    { versions: [{ provenance: { writerModel: 'writer-model-1' } }] },
  ]);
});

test('it exports a retired item with every version, oldest first, and the file matches the schema', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Takes the 7:40 ferry to work',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.retire({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const text = await ctx.readExportText(Date.parse('2026-10-14T08:00:00.000Z'));

  expect(memoryExportSchema.safeParse(JSON.parse(text)).data?.items).toMatchObject([
    {
      itemID: item.itemID,
      state: 'retired',
      versions: [
        { version: 1, change: 'created', state: 'active', text: 'Takes the 7:40 ferry to work' },
        { version: 2, change: 'retired', state: 'retired', text: 'Takes the 7:40 ferry to work' },
      ],
    },
  ]);
});

test('it exports a forgotten item as only its ID and the time it was forgotten, and the file matches the schema', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Keeps a spare key under the blue pot',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  setSystemTime(new Date('2026-10-13T18:30:00.000Z'));

  await ctx.memory.store.forget({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const text = await ctx.readExportText(Date.parse('2026-10-14T08:00:00.000Z'));

  expect(memoryExportSchema.safeParse(JSON.parse(text)).data?.items).toStrictEqual([
    { itemID: item.itemID, forgottenAt: '2026-10-13T18:30:00.000Z' },
  ]);
});

test('it never writes a forgotten item’s words into the file', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Keeps a spare key under the blue pot',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.forget({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const text = await ctx.readExportText(Date.parse('2026-10-14T08:00:00.000Z'));

  expect(text).not.toInclude('blue pot');
});

test("it heads the file with the export time, the schema version and the definitions' snapshot hash", async () => {
  const ctx = await setupTest({ definitions: () => ({ snapshotHash: 'sha256:4be1c0' }) });
  const text = await ctx.readExportText(Date.parse('2026-10-14T08:00:00.000Z'));

  expect(JSON.parse(text)).toStrictEqual({
    header: {
      schemaVersion: 5,
      exportedAt: '2026-10-14T08:00:00.000Z',
      snapshotHash: 'sha256:4be1c0',
    },
    items: [],
    moments: [],
  });
});

test('it exports every item in the order it was created across more than one page', async () => {
  const ctx = await setupTest();

  const created = await Array.fromAsync({ length: 101 }, (_, index) =>
    ctx.memory.store.remember({
      text: `Owns houseplant number ${index + 1}`,
      provenance: {
        origin: 'owner',
        source: 'owner',
        taskID: null,
        proposalID: null,
        checks: null,
      },
    }),
  );

  const text = await ctx.readExportText(Date.parse('2026-10-14T08:00:00.000Z'));

  expect(
    memoryExportSchema.safeParse(JSON.parse(text)).data?.items.map((item) => item.itemID),
  ).toStrictEqual(created.map((item) => item.itemID));
});

test('it exports the end time of each version and the lapse that retired it', async () => {
  const clock = buildTestClock(Date.parse('2026-10-19T09:00:00Z'));

  const ctx = await setupTest({ gate: { clock } });

  await ctx.memory.store.remember({
    text: 'Is in Lisbon this week',
    until: Date.parse('2026-10-19T22:59:59Z'),
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  clock.advance(Date.parse('2026-10-20T00:41:00Z') - clock.now());

  await ctx.memory.store.lapse();

  const text = await ctx.readExportText(Date.parse('2026-10-20T08:00:00.000Z'));

  expect(memoryExportSchema.safeParse(JSON.parse(text)).data?.items).toMatchObject([
    {
      state: 'retired',
      versions: [
        { version: 1, until: '2026-10-19T22:59:59.000Z', provenance: { origin: 'owner' } },
        { version: 2, until: '2026-10-19T22:59:59.000Z', provenance: { origin: 'lapse' } },
      ],
    },
  ]);
});

test('it exports a moment with its title, note, reflections and links and its span decrypted, and the file matches the schema', async () => {
  const ctx = await setupTest();

  const [message, reply] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'owner',
      erasable: { text: 'the allotment plot is number 14' },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Plot 14 it is, next to the tap.' },
    },
  ]);

  invariant(message && reply);

  const item = await ctx.memory.store.remember({
    text: 'Rents allotment plot 14',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'chat-model-2' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: reply.sequence,
    title: 'The allotment plot decision',
  });

  invariant(kept.status === 'written');

  const reflected = await ctx.memory.store.moments.edit({
    caller: { kind: 'model', thread: 'conversation', model: 'chat-model-2' },
    target: { momentID: kept.shortID, version: 1 },
    change: { kind: 'reflection', text: 'Distance to the tap mattered more than the size.' },
  });

  invariant(reflected.status === 'written' && reflected.reflectionID !== undefined);

  await ctx.memory.store.moments.edit({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 2 },
    change: { kind: 'note', note: 'This is when we chose plot 14.' },
  });

  await ctx.memory.store.moments.link({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 3 },
    itemID: item.itemID,
    isLinked: true,
  });

  const text = await ctx.readExportText(Date.parse('2026-10-14T08:00:00.000Z'));

  expect(memoryExportSchema.safeParse(JSON.parse(text)).data?.moments).toStrictEqual([
    {
      momentID: kept.momentID,
      shortID: kept.shortID,
      state: 'active',
      thread: 'conversation',
      firstSequence: message.sequence,
      lastSequence: reply.sequence,
      keptBy: 'model',
      keptThread: 'conversation',
      keptModel: 'chat-model-2',
      keptAt: expect.toBeString(),
      editedAt: expect.toBeString(),
      title: 'The allotment plot decision',
      note: 'This is when we chose plot 14.',
      reflections: [
        {
          reflectionID: reflected.reflectionID,
          model: 'chat-model-2',
          writtenAt: expect.toBeString(),
          text: 'Distance to the tap mattered more than the size.',
        },
      ],
      links: [item.itemID],
      records: [
        {
          sequence: message.sequence,
          kind: 'owner_message',
          recordedAt: expect.toBeString(),
          source: 'owner',
          text: 'the allotment plot is number 14',
          isGap: false,
        },
        {
          sequence: reply.sequence,
          kind: 'model.reply',
          recordedAt: expect.toBeString(),
          source: 'nixie',
          text: 'Plot 14 it is, next to the tap.',
          isGap: false,
        },
      ],
    },
  ]);
});

test('it exports a destroyed moment as its ID and the time its destroy completed', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the allotment plot is number 14' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The allotment plot decision',
  });

  invariant(kept.status === 'written');

  await ctx.memory.store.moments.destroy({ momentID: kept.momentID, version: 1 });

  const text = await ctx.readExportText(Date.parse('2026-10-14T08:00:00.000Z'));

  expect(memoryExportSchema.safeParse(JSON.parse(text)).data?.moments).toStrictEqual([
    { momentID: kept.momentID, destroyedAt: expect.toBeString() },
  ]);
});
