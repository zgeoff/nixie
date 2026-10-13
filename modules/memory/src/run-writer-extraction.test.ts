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
  const [request] = session.model.runSession.mock.calls[0] as unknown as [
    { readonly systemPrompt: string; readonly prompt: string },
  ];

  invariant(held.status === 'proposed');
  expect(request.prompt).toStartWith(
    [
      'Current memory items (the complete list):',
      `- ${item.itemID}: The owner plays the cello.`,
      '',
      "Pending proposals, waiting for the owner's review:",
      `- ${held.proposalID}: The owner is allergic to hazelnuts.`,
    ].join('\n'),
  );
  expect(request.systemPrompt).toInclude(
    'When a pending proposal already holds a fact, stage nothing for it, even when the batch states it in other words.',
  );
});
