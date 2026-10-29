import { expect, test } from 'bun:test';
import { isTakingOwnerMessages } from './is-taking-owner-messages';

test.each([
  ['the conversation', 1, null, true],
  ['a task the conversation started', 0, 'conversation', true],
  ['a task the user started by a move', 0, 'owner', true],
  ['a task that runs on its own schedule', 0, null, false],
] as const)(
  'it says whether %s takes a message of the user',
  (_label, isConversation, startedBy, expected) => {
    expect(isTakingOwnerMessages({ is_conversation: isConversation, started_by: startedBy })).toBe(
      expected,
    );
  },
);
