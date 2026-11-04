import { expect, test } from 'bun:test';
import { isGuestPurged, pickCleanedTaskIDs } from './plan-task-session-cleanup';

test('it picks only the tasks that read memory', () => {
  expect(
    pickCleanedTaskIDs([
      {
        taskID: 'tide-tables',
        setup: {
          startedBy: 'conversation',
          options: {
            model: null,
            profile: null,
            persona: 'default',
            memory: 'read',
            tools: ['tasks.list', 'task.message'],
            report: 'wake',
            limits: { turns: 25, dollars: 2 },
          },
          limits: { turns: 25, dollars: 2 },
        },
      },
      {
        taskID: 'moon-phases',
        setup: {
          startedBy: 'conversation',
          options: {
            model: null,
            profile: null,
            persona: 'none',
            memory: 'none',
            tools: ['tasks.list', 'task.message'],
            report: 'wake',
            limits: { turns: 25, dollars: 2 },
          },
          limits: { turns: 25, dollars: 2 },
        },
      },
      { taskID: 'moved-message', setup: { startedBy: 'owner', options: null, limits: null } },
      { taskID: 'gone', setup: null },
    ]),
  ).toStrictEqual(['tide-tables']);
});

test.each([
  [0, false],
  [1, true],
])('it purges the guest of a task with %i sandboxes: %s', (count, isPurged) => {
  expect(isGuestPurged(count)).toBe(isPurged);
});
