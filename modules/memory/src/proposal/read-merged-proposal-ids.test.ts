import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { buildMockWriteCaller } from '../test-utils/build-mock-write-caller';
import { startTestMemory } from '../test-utils/start-test-memory';
import { readMergedProposalIDs } from './read-merged-proposal-ids';

test('it names the proposal that a write of a task thread merged into', async () => {
  const memory = await startTestMemory();

  const text = 'Keeps a rowing boat at the lake';

  const first = await memory.store.writes.remember({
    text,
    caller: buildMockWriteCaller({ thread: 'conversation' }),
  });

  await memory.store.writes.remember({
    text,
    caller: buildMockWriteCaller({ origin: 'task', thread: 'task-1', taskID: 'task-1' }),
  });

  const merged = await readMergedProposalIDs(memory.writer.db, ['task-1']);

  invariant(first.status === 'proposed', 'the first write opened a proposal');

  expect([...merged]).toStrictEqual([first.proposalID]);
});

test('it names no proposal for a thread that merged into none', async () => {
  const memory = await startTestMemory();

  await memory.store.writes.remember({
    text: 'Keeps a rowing boat at the lake',
    caller: buildMockWriteCaller({ thread: 'conversation' }),
  });

  const merged = await readMergedProposalIDs(memory.writer.db, ['task-1']);

  expect([...merged]).toStrictEqual([]);
});
