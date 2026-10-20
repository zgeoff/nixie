import { expect, test } from 'bun:test';
import { buildTestClock } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { readWriterBatch } from './read-writer-batch';
import { runWriterExtraction } from './run-writer-extraction';
import { buildMockWriteCaller } from './test-utils/build-mock-write-caller';
import { createStubWriterSession } from './test-utils/create-stub-writer-session';
import { startTestMemory } from './test-utils/start-test-memory';
import { writePlannedBatch } from './test-utils/write-planned-batch';
import { writerConfigSchema } from './writer-config-schema';

// a memory with the writer's parts over it, which a test completes with its stub session
async function setupTest() {
  const memory = await startTestMemory();

  const parts = {
    context: {
      log: memory.log,
      clock: buildTestClock(0),
      definitions: () => ({ snapshotHash: 'sha256:test' }),
    },
    store: memory.store,
    publish: memory.store.writeBatch,
    gate: memory.store.writes.batch,
    config: writerConfigSchema.parse({}),
    getPersona: () => '',
    ownerName: null,
    assistantName: null,
  };

  return { memory, parts };
}

test('it shows the writer the pending proposals beside the current items, with the rule to stage nothing a proposal holds', async () => {
  const ctx = await setupTest();

  const [item, held] = await Promise.all([
    ctx.memory.store.remember({
      text: 'The owner plays the cello.',
      provenance: {
        origin: 'owner',
        source: 'owner',
        taskID: null,
        proposalID: null,
        checks: null,
      },
    }),
    ctx.memory.store.writes.remember({
      text: 'The owner is allergic to hazelnuts.',
      caller: buildMockWriteCaller(),
    }),
  ]);

  const planned = await writePlannedBatch(ctx.memory.log, ['Hazelnuts make me ill, careful.']);

  const session = createStubWriterSession({
    op: 'remember',
    subject: 'owner',
    text: 'The owner reacts badly to hazelnuts.',
    quote: 'Hazelnuts make me ill',
    sourceSequence: planned.bounds.end,
    itemID: null,
  });

  const batch = await readWriterBatch(ctx.memory.log, planned.bounds);

  await runWriterExtraction({ ...ctx.parts, ...session }, batch, new AbortController().signal);

  invariant(held.status === 'proposed');

  const listed = [
    'Current memory items (the complete list):',
    `- ${item.itemID} (owner): The owner plays the cello.`,
    '',
    "Pending proposals, waiting for the owner's review:",
    `- ${held.proposalID} (owner): The owner is allergic to hazelnuts.`,
  ].join('\n');

  expect(session.model.runSession).toHaveBeenCalledWith(
    expect.objectContaining({
      prompt: expect.toStartWith(listed),
      systemPrompt: expect.toInclude(
        'When a pending proposal already holds a fact, stage nothing for it, even when the batch states it in other words.',
      ),
    }),
  );
});

test('it shows the writer the image markers of your message on the lines after its text', async () => {
  const ctx = await setupTest();
  const planned = await writePlannedBatch(ctx.memory.log, ['I painted the fence green.']);

  const session = createStubWriterSession({
    op: 'remember',
    subject: 'owner',
    text: 'The owner painted the fence green.',
    quote: 'I painted the fence green.',
    sourceSequence: planned.bounds.end,
    itemID: null,
  });

  const batch = {
    bounds: planned.bounds,
    entries: [
      {
        sequence: planned.bounds.end,
        role: 'owner' as const,
        text: 'I painted the fence green.',
        spans: [],
        imageMarkers: [
          '<dropped-image id="0a1b2c3d4e5f" n="1"/>',
          '<dropped-image id="6a7b8c9d0e1f" n="2"/>',
        ],
        recordedAt: 1_000_000,
        arrivedAt: null,
      },
    ],
    sources: new Map([
      [
        planned.bounds.end,
        { sequence: planned.bounds.end, text: 'I painted the fence green.', spans: [] },
      ],
    ]),
  };

  await runWriterExtraction({ ...ctx.parts, ...session }, batch, new AbortController().signal);

  expect(session.model.runSession).toHaveBeenCalledWith(
    expect.objectContaining({
      prompt: expect.toInclude(
        'owner: I painted the fence green.\n<dropped-image id="0a1b2c3d4e5f" n="1"/>\n<dropped-image id="6a7b8c9d0e1f" n="2"/>',
      ),
    }),
  );
});

test('it tells the writer to name the owner and the assistant by their configured names', async () => {
  const ctx = await setupTest();
  const planned = await writePlannedBatch(ctx.memory.log, ['I play the cello on Sundays.']);

  const session = createStubWriterSession({
    op: 'remember',
    subject: 'owner',
    text: 'Avery plays the cello on Sundays.',
    quote: 'I play the cello on Sundays.',
    sourceSequence: planned.bounds.end,
    itemID: null,
  });

  const batch = await readWriterBatch(ctx.memory.log, planned.bounds);

  await runWriterExtraction(
    { ...ctx.parts, ...session, ownerName: 'Avery', assistantName: 'Wren' },
    batch,
    new AbortController().signal,
  );

  expect(session.model.runSession).toHaveBeenCalledWith(
    expect.objectContaining({
      systemPrompt: expect.toInclude(
        '- Write an owner memory as one plain sentence that names the owner "Avery", and a shared memory as one plain sentence that names the owner "Avery" and the assistant "Wren".',
      ),
      prompt: expect.toInclude('Avery (owner): I play the cello on Sundays.'),
    }),
  );
});

test('it shows the writer only the pending proposals it may write, and never a self-note', async () => {
  const ctx = await setupTest();

  const held = await ctx.memory.store.writes.remember({
    text: 'The owner is allergic to hazelnuts.',
    caller: buildMockWriteCaller(),
  });

  await ctx.memory.store.writes.remember({
    text: 'I find hazelnut jokes tiresome.',
    subject: 'self',
    caller: buildMockWriteCaller(),
  });

  const planned = await writePlannedBatch(ctx.memory.log, ['Hazelnuts make me ill, careful.']);

  const session = createStubWriterSession({
    op: 'remember',
    subject: 'owner',
    text: 'The owner reacts badly to hazelnuts.',
    quote: 'Hazelnuts make me ill',
    sourceSequence: planned.bounds.end,
    itemID: null,
  });

  const batch = await readWriterBatch(ctx.memory.log, planned.bounds);

  await runWriterExtraction({ ...ctx.parts, ...session }, batch, new AbortController().signal);

  invariant(held.status === 'proposed');

  const proposals = [
    "Pending proposals, waiting for the owner's review:",
    `- ${held.proposalID} (owner): The owner is allergic to hazelnuts.`,
    '',
    'Messages in this batch:',
  ].join('\n');

  expect(session.model.runSession).toHaveBeenCalledWith(
    expect.objectContaining({ prompt: expect.toInclude(proposals) }),
  );
});

test('it returns the flags the session staged beside its writes', async () => {
  const ctx = await setupTest();
  const planned = await writePlannedBatch(ctx.memory.log, ['You always pick the jazz station.']);

  const session = createStubWriterSession({
    op: 'flag',
    text: 'The assistant favours the jazz station.',
    sourceSequence: planned.bounds.end,
  });

  const batch = await readWriterBatch(ctx.memory.log, planned.bounds);

  const extracted = await runWriterExtraction(
    { ...ctx.parts, ...session },
    batch,
    new AbortController().signal,
  );

  expect(extracted.writes).toStrictEqual([]);

  expect(extracted.flags).toStrictEqual([
    { text: 'The assistant favours the jazz station.', sourceSequence: planned.bounds.end },
  ]);
});
