import { expect, test } from 'bun:test';
import { canReplyWake } from './can-reply-wake';

test.each([
  ['wakes a sender when the reply reaches the limit', 'planner', 2, true],
  ['never wakes a sender past the limit', 'planner', 3, false],
  ['never wakes a scheduled sender', 'sweeper', 0, false],
  ['never wakes a sender outside the directory', 'gardener', 0, false],
] as const)('it %s', (_label, senderID, hop, expected) => {
  expect(
    canReplyWake(
      {
        directory: [
          {
            taskID: 'planner',
            name: 'Planner',
            brief: 'Plans.',
            isWokenByMessages: true,
            speaker: 'plain_task',
          },
          {
            taskID: 'sweeper',
            name: 'Sweeper',
            brief: 'Saves.',
            isWokenByMessages: false,
            speaker: 'plain_task',
          },
        ],
        hopLimit: 3,
      },
      { hop, cause: { kind: 'owner' } },
      senderID,
    ),
  ).toBe(expected);
});
