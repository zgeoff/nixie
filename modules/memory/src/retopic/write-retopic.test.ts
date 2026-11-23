import { expect, test } from 'bun:test';
import { buildMockProvenance } from '../test-utils/build-mock-provenance';
import { buildMockWriteCaller } from '../test-utils/build-mock-write-caller';
import { startTestMemory } from '../test-utils/start-test-memory';

test('it moves self-notes to another topic for a granted task', async () => {
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
    }),
  });

  const labels = await memory.store.writes.readItemLabels(item.itemID);

  expect(plan.moves).toMatchObject([{ fromSubject: 'self', toTopic: 'diary' }]);
  expect(labels.topic).toBe('diary');
});
