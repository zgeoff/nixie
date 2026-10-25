import { expect, test } from 'bun:test';
import { buildMockTaskMessageView } from './build-mock-task-message-view';

test('it builds the view of a step the owner woke, with the conversation in the directory', () => {
  expect(buildMockTaskMessageView()).toStrictEqual({
    messaging: {
      directory: [
        {
          taskID: 'conversation',
          name: 'Conversation',
          brief: 'Talks with the owner.',
          isWokenByMessages: true,
        },
      ],
      hopLimit: 20,
      ownerName: null,
    },
    wake: { hop: 0, cause: { kind: 'owner' } },
  });
});

test('it takes the wake a test gives', () => {
  expect(
    buildMockTaskMessageView({ wake: { hop: 7, cause: { kind: 'carried' } } }).wake,
  ).toStrictEqual({ hop: 7, cause: { kind: 'carried' } });
});
