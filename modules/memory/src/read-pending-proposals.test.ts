import { expect, test } from 'bun:test';
import { buildMockWriteCaller } from './test-utils/build-mock-write-caller';
import { startTestMemory } from './test-utils/start-test-memory';
import type { MemoryTables } from './types';

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
    .set({ review_reason: 'self_note' })
    .execute();

  const pending = await memory.store.proposals.listPending();

  expect(pending).toMatchObject([{ reason: 'other', text: 'Keeps a rowing boat at the lake' }]);
});
