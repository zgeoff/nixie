import { expect, test } from 'bun:test';
import { buildMockWriteCaller, startTestMemory } from '../test-utils';
import { buildMockProvenance } from '../test-utils/build-mock-provenance';
import type { MemoryTables } from '../types';

test('it records a pass for the token check when the labels add no number the text lacks', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'The shed key is the brass one, number 14',
    labels: { gist: 'shed key', topic: 'home', triggers: [] },
    provenance: buildMockProvenance(),
  });

  await memory.store.writes.editLabels({
    target: item,
    labels: { gist: 'shed key 14', topic: 'home', triggers: [] },
    caller: buildMockWriteCaller(),
  });

  const row = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_proposals')
    .select(['review_reason', 'checks'])
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({
    review_reason: 'labels',
    checks: JSON.stringify({ tokens: 'pass' }),
  });
});

test('it records a fail for the token check when a label holds a phone number the text lacks', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'The shed key is the brass one',
    labels: { gist: 'shed key', topic: 'home', triggers: [] },
    provenance: buildMockProvenance(),
  });

  await memory.store.writes.editLabels({
    target: item,
    labels: { gist: 'shed key 0412 555 019', topic: 'home', triggers: [] },
    caller: buildMockWriteCaller(),
  });

  const row = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_proposals')
    .select(['review_reason', 'checks'])
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({
    review_reason: 'labels',
    checks: JSON.stringify({ tokens: 'fail' }),
  });
});

test('it gives a label with a hidden character the invisible character reason', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'The shed key is the brass one',
    labels: { gist: 'shed key', topic: 'home', triggers: [] },
    provenance: buildMockProvenance(),
  });

  await memory.store.writes.editLabels({
    target: item,
    labels: { gist: 'shed​key', topic: 'home', triggers: [] },
    caller: buildMockWriteCaller(),
  });

  const pending = await memory.store.proposals.listPending();

  expect(pending).toMatchObject([{ reason: 'invisible_character' }]);
});
