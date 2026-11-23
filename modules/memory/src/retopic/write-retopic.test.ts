import { expect, test } from 'bun:test';
import { buildMockProvenance } from '../test-utils/build-mock-provenance';
import { buildMockWriteCaller } from '../test-utils/build-mock-write-caller';
import { startTestMemory } from '../test-utils/start-test-memory';
import { SelfNoteError } from '../utils/error/self-note-error';

test('it moves self-notes to another topic for a task that holds the tool only through the grant', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'I like tidy lists',
    subject: 'self',
    labels: { gist: 'tidy lists', topic: 'habits', triggers: [] },
    provenance: buildMockProvenance(),
  });

  const plan = await memory.store.writes.retopic({
    source: { kind: 'topic', topic: 'habits', subject: 'self' },
    to: { topic: 'diary', subject: 'self' },
    caller: buildMockWriteCaller({
      origin: 'task',
      thread: 'task-1',
      taskID: 'task-1',
      hasSelfNoteGrant: true,
      isSelfNoteOnly: true,
    }),
  });

  const recalled = await memory.store.recall({ itemIDs: [item.itemID], includeHistory: true });

  expect(plan.moves).toMatchObject([{ fromSubject: 'self', toTopic: 'diary' }]);

  expect(recalled.items).toMatchObject([
    {
      topic: 'diary',
      labelHistory: [
        { revision: 1, topic: 'habits' },
        { revision: 2, topic: 'diary' },
      ],
    },
  ]);
});

test('it refuses a move of an owner item through a tool that only the grant gives a task, and leaves its topic', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'Lives on Elm Street',
    labels: { gist: 'home', topic: 'home', triggers: [] },
    provenance: buildMockProvenance(),
  });

  const move = memory.store.writes.retopic({
    source: { kind: 'topic', topic: 'home', subject: 'owner' },
    to: { topic: 'address', subject: 'owner' },
    caller: buildMockWriteCaller({
      origin: 'task',
      thread: 'task-1',
      taskID: 'task-1',
      hasSelfNoteGrant: true,
      isSelfNoteOnly: true,
    }),
  });

  await Promise.allSettled([move]);

  const recalled = await memory.store.recall({ itemIDs: [item.itemID], includeHistory: true });

  expect(move).rejects.toThrow(SelfNoteError);
  expect(recalled.items).toMatchObject([{ topic: 'home', labelHistory: [{ revision: 1 }] }]);
});
