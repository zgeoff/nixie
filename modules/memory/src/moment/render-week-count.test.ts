import { expect, test } from 'bun:test';
import { renderWeekCount } from './render-week-count';

test.each([
  [
    'none',
    { total: 0, byConversation: 0, byTasks: 0, byOwner: 0, waitingForReflection: 0 },
    'Moments kept this week: 0.',
  ],
  [
    'one by the conversation, reflected on',
    { total: 1, byConversation: 1, byTasks: 0, byOwner: 0, waitingForReflection: 0 },
    'Moments kept this week: 1 (1 by you).',
  ],
  [
    'two by other tasks and one by the owner',
    { total: 3, byConversation: 0, byTasks: 2, byOwner: 1, waitingForReflection: 3 },
    'Moments kept this week: 3 (2 by your other tasks, 1 by Wren). 3 are waiting for a reflection.',
  ],
])('it renders the week of %s', (_, count, line) => {
  expect(renderWeekCount(count, 'Wren')).toBe(line);
});

test('it names the owner as the owner when the deployment gives no name', () => {
  expect(
    renderWeekCount(
      { total: 1, byConversation: 0, byTasks: 0, byOwner: 1, waitingForReflection: 1 },
      null,
    ),
  ).toBe('Moments kept this week: 1 (1 by the owner). 1 is waiting for a reflection.');
});
