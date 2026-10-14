import { expect, test } from 'bun:test';
import { buildTestClock } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { readWriterBatch } from './read-writer-batch';
import { runWriterExtraction } from './run-writer-extraction';
import { buildMockWriteCaller } from './test-utils/build-mock-write-caller';
import { buildStubWriterSession } from './test-utils/build-stub-writer-session';
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
  const session = buildStubWriterSession({
    op: 'remember',
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
    `- ${item.itemID}: The owner plays the cello.`,
    '',
    "Pending proposals, waiting for the owner's review:",
    `- ${held.proposalID}: The owner is allergic to hazelnuts.`,
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

test('it tells the writer to name the owner by the configured name', async () => {
  const ctx = await setupTest();
  const planned = await writePlannedBatch(ctx.memory.log, ['I play the cello on Sundays.']);
  const session = buildStubWriterSession({
    op: 'remember',
    text: 'Avery plays the cello on Sundays.',
    quote: 'I play the cello on Sundays.',
    sourceSequence: planned.bounds.end,
    itemID: null,
  });
  const batch = await readWriterBatch(ctx.memory.log, planned.bounds);

  await runWriterExtraction(
    { ...ctx.parts, ...session, ownerName: 'Avery' },
    batch,
    new AbortController().signal,
  );

  expect(session.model.runSession).toHaveBeenCalledWith(
    expect.objectContaining({
      systemPrompt: expect.toInclude(
        '- Write the memory text as one plain sentence that names the owner "Avery".',
      ),
    }),
  );
});
