import { expect, test } from 'bun:test';
import { buildMockToolContext } from '@heynixie/tools/test-utils';
import { buildWriteCaller } from './build-write-caller';

test('it marks a task run that holds the grant as granted', () => {
  const context = buildMockToolContext({
    run: { ...buildMockToolContext().run, thread: 'task-1', hasSelfNoteGrant: true },
  });

  expect(buildWriteCaller(context)).toMatchObject({
    origin: 'task',
    taskID: 'task-1',
    hasSelfNoteGrant: true,
  });
});

test('it marks a task run with no grant as ungranted', () => {
  const context = buildMockToolContext({
    run: { ...buildMockToolContext().run, thread: 'task-1' },
  });

  expect(buildWriteCaller(context)).toMatchObject({ origin: 'task', hasSelfNoteGrant: false });
});

test('it never marks the conversation as granted', () => {
  const context = buildMockToolContext({
    run: { ...buildMockToolContext().run, thread: 'conversation', hasSelfNoteGrant: true },
  });

  expect(buildWriteCaller(context)).toMatchObject({ origin: 'conversation' });
  expect(buildWriteCaller(context)).not.toHaveProperty('hasSelfNoteGrant');
});
