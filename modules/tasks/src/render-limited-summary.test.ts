import { expect, test } from 'bun:test';
import { renderLimitedSummary } from './render-limited-summary';

test('it tells the receiver the held messages, its cause, and that its reply wakes the sender', () => {
  expect(
    renderLimitedSummary(
      {
        directory: [
          { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
        ],
        hopLimit: 20,
        ownerName: 'Robin',
      },
      { senderID: 'planner', count: 3, wake: { hop: 0, cause: { kind: 'owner' } } },
    ),
  ).toBe(
    '3 messages from Planner arrived after the exchange reached its limit, so they did not wake you. Oldest first. You woke for a message from Robin, so a reply from you will wake Planner.',
  );
});

test('it tells the receiver its reply will not wake a sender at the limit', () => {
  expect(
    renderLimitedSummary(
      {
        directory: [
          { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
          { taskID: 'critic', name: 'Critic', brief: 'Checks plans.', isWokenByMessages: true },
        ],
        hopLimit: 20,
        ownerName: 'Robin',
      },
      {
        senderID: 'planner',
        count: 1,
        wake: { hop: 20, cause: { kind: 'task', taskID: 'critic' } },
      },
    ),
  ).toBe(
    '1 message from Planner arrived after the exchange reached its limit, so it did not wake you. You woke for a message from Critic, so a reply from you will not wake Planner.',
  );
});

test.each([
  ['timer', 'a timer'],
  ['event', 'an outside event'],
  ['carried', 'work you continued'],
] as const)('it names a wake for a %s as %s', (kind, cause) => {
  expect(
    renderLimitedSummary(
      {
        directory: [
          { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
        ],
        hopLimit: 20,
        ownerName: 'Robin',
      },
      { senderID: 'planner', count: 2, wake: { hop: 0, cause: { kind } } },
    ),
  ).toInclude(`You woke for ${cause}, so`);
});
