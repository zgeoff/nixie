import { expect, test } from 'bun:test';
import { buildMockToolContext } from '@heynixie/tools/test-utils';
import { buildWriteCaller } from './build-write-caller';

test('it marks a task run that holds the grant as granted', () => {
  const context = buildMockToolContext({
    run: { ...buildMockToolContext().run, thread: 'task-1', hasSelfNoteGrant: true },
  });

  expect(buildWriteCaller(context, 'memory.remember')).toMatchObject({
    origin: 'task',
    taskID: 'task-1',
    hasSelfNoteGrant: true,
  });
});

test('it marks a task run with no grant as ungranted', () => {
  const context = buildMockToolContext({
    run: { ...buildMockToolContext().run, thread: 'task-1' },
  });

  expect(buildWriteCaller(context, 'memory.remember')).toMatchObject({
    origin: 'task',
    hasSelfNoteGrant: false,
  });
});

test('it never marks the conversation as granted', () => {
  const context = buildMockToolContext({
    run: { ...buildMockToolContext().run, thread: 'conversation', hasSelfNoteGrant: true },
  });

  expect(buildWriteCaller(context, 'memory.remember')).toMatchObject({ origin: 'conversation' });
  expect(buildWriteCaller(context, 'memory.remember')).not.toHaveProperty('hasSelfNoteGrant');
});

test.each([
  { tool: 'memory.remember', isSelfNoteOnly: true },
  { tool: 'memory.edit', isSelfNoteOnly: false },
])(
  'it marks $tool as self-note only for a task run when the grant alone gives it: $isSelfNoteOnly',
  (testCase) => {
    const context = buildMockToolContext({
      run: {
        ...buildMockToolContext().run,
        thread: 'task-1',
        hasSelfNoteGrant: true,
        selfNoteOnlyTools: ['memory.remember'],
      },
    });

    expect(buildWriteCaller(context, testCase.tool)).toMatchObject({
      origin: 'task',
      isSelfNoteOnly: testCase.isSelfNoteOnly,
    });
  },
);
