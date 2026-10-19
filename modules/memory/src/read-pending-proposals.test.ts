import { expect, test } from 'bun:test';
import { buildMockWriteCaller } from './test-utils/build-mock-write-caller';
import { startTestMemory } from './test-utils/start-test-memory';
import type { MemoryTables } from './types';

test('it lists only the pending proposals of the subjects the filter names', async () => {
  const memory = await startTestMemory();

  await memory.store.writes.remember({
    text: 'Keeps a rowing boat at the lake',
    caller: buildMockWriteCaller(),
  });

  await memory.store.writes.remember({
    text: 'The owner and the assistant say "anchors up" before a long task',
    subject: 'shared',
    caller: buildMockWriteCaller(),
  });

  await memory.store.writes.remember({
    text: 'I like the sound of rain in a story',
    subject: 'self',
    caller: buildMockWriteCaller(),
  });

  const pending = await memory.store.proposals.listPending({ subjects: ['owner', 'shared'] });

  expect(pending.map((proposal) => [proposal.subject, proposal.text])).toStrictEqual([
    ['owner', 'Keeps a rowing boat at the lake'],
    ['shared', 'The owner and the assistant say "anchors up" before a long task'],
  ]);
});

test('it lists a pending proposal whose review reason a later release wrote with the reason other', async () => {
  const memory = await startTestMemory();

  await memory.store.writes.remember({
    text: 'Keeps a rowing boat at the lake',
    caller: buildMockWriteCaller(),
  });

  // a later release's reason, in the row it left behind before a rollback
  await memory.log.writer.db
    .$extendTables<MemoryTables>()
    .updateTable('memory_proposals')
    .set({ review_reason: 'quote_too_old' })
    .execute();

  const pending = await memory.store.proposals.listPending();

  expect(pending).toMatchObject([{ reason: 'other', text: 'Keeps a rowing boat at the lake' }]);
});
