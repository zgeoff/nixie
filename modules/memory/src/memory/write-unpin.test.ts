import { expect, test } from 'bun:test';
import { buildAllowVerdict } from '../test-utils/build-allow-verdict';
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

test('it unpins a pinned self-note for a granted task, as it does for a task with no grant', async () => {
  const memory = await startTestMemory();

  const note = await memory.store.remember({
    text: 'I like tidy lists',
    subject: 'self',
    provenance: buildMockProvenance(),
  });

  await memory.store.writes.pin({
    target: note,
    caller: buildMockWriteCaller(),
    verdict: buildAllowVerdict([{ arg: 'subject', op: 'eq', value: 'self' }]),
  });

  const outcome = await memory.store.writes.unpin({
    itemID: note.itemID,
    caller: buildMockWriteCaller({
      origin: 'task',
      thread: 'task-1',
      taskID: 'task-1',
      hasSelfNoteGrant: true,
    }),
  });

  const core = await memory.store.readPinnedCore();

  expect(outcome).toMatchObject({ status: 'applied', itemID: note.itemID });
  expect(core).toStrictEqual([]);
});
