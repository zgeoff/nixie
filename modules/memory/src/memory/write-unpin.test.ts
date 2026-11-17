import { expect, test } from 'bun:test';
import { buildMockProvenance } from '../test-utils/build-mock-provenance';
import { buildMockWriteCaller } from '../test-utils/build-mock-write-caller';
import { startTestMemory } from '../test-utils/start-test-memory';

test.each([
  { from: 'conversation', caller: buildMockWriteCaller(), thread: 'conversation' },
  {
    from: 'task',
    caller: buildMockWriteCaller({ origin: 'task', thread: 'task-1', taskID: 'task-1' }),
    thread: 'task-1',
  },
] as const)('it unpins an item at once with a notice, from the $from', async (testCase) => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'Keeps a kettlebell by the door',
    isPinned: true,
    provenance: buildMockProvenance(),
  });

  const outcome = await memory.store.writes.unpin({
    itemID: item.itemID,
    caller: testCase.caller,
  });

  const core = await memory.store.readPinnedCore();
  const notices = await memory.store.readNotices(testCase.thread);

  expect(outcome).toStrictEqual({ status: 'applied', itemID: item.itemID, version: 1 });
  expect(core).toStrictEqual([]);

  expect(notices.flatMap((notice) => notice.entries)).toMatchObject([
    { itemID: item.itemID, change: 'unpinned', version: null },
  ]);
});
