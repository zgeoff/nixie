import { expect, test } from 'bun:test';
import { buildMockProvenance } from '../test-utils/build-mock-provenance';
import { buildMockWriteCaller } from '../test-utils/build-mock-write-caller';
import { startTestMemory } from '../test-utils/start-test-memory';
import { SelfNoteError } from '../utils/error/self-note-error';

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

test.each([
  { from: 'owner', to: 'self' },
  { from: 'self', to: 'owner' },
  { from: 'self', to: 'shared' },
  { from: 'shared', to: 'self' },
] as const)(
  'it refuses a granted task a topic move from $from to $to, and moves nothing',
  async (move) => {
    const memory = await startTestMemory();

    const item = await memory.store.remember({
      text: 'I like tidy lists',
      subject: move.from,
      labels: { gist: 'tidy lists', topic: 'habits', triggers: [] },
      provenance: buildMockProvenance(),
    });

    const write = memory.store.writes.retopic({
      source: { kind: 'topic', topic: 'habits', subject: move.from },
      to: { topic: 'habits', subject: move.to },
      caller: buildMockWriteCaller({
        origin: 'task',
        thread: 'task-1',
        taskID: 'task-1',
        hasSelfNoteGrant: true,
      }),
    });

    await Promise.allSettled([write]);

    const labels = await memory.store.writes.readItemLabels(item.itemID);
    const subject = await memory.store.writes.readItemSubject(item.itemID);

    expect(write).rejects.toThrowWithMessage(SelfNoteError, /whose subject is \w+/u);
    expect(labels.topic).toBe('habits');
    expect(subject).toBe(move.from);
  },
);
