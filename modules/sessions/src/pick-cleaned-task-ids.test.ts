import { expect, test } from 'bun:test';
import { isGuestPurged, pickCleanedTaskIDs } from './pick-cleaned-task-ids';

test('it picks only the tasks that read memory for a forgotten memory item or a destroyed moment', () => {
  expect(
    pickCleanedTaskIDs(
      [
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
      ],
      null,
    ),
  ).toStrictEqual(['tide-tables']);
});

test.each([
  [0, false],
  [1, true],
])('it purges the guest of a task with %i sandboxes: %s', (count, isPurged) => {
  expect(isGuestPurged(count)).toBe(isPurged);
});

test.each([
  [
    'a record thread on a task that reads no memory',
    ['none', 'none'],
    'kelp-survey',
    ['kelp-survey'],
  ],
  [
    'a record thread beside a task that reads memory',
    ['none', 'read', 'none'],
    'kelp-survey',
    ['kelp-survey', 'reef-census'],
  ],
  ['a record thread on a task that reads memory', ['read', 'none'], 'kelp-survey', ['kelp-survey']],
  ['the conversation thread', ['none', 'read'], 'conversation', ['reef-census']],
  ['no thread', ['none', 'read'], null, ['reef-census']],
] as const)('it picks the right tasks for %s', (_title, memories, thread, expected) => {
  const names = ['kelp-survey', 'reef-census', 'dune-count'];

  const candidates = memories.map((memory, index) => ({
    taskID: names[index] ?? 'extra',
    setup: {
      startedBy: 'conversation' as const,
      options: {
        model: null,
        profile: null,
        persona: 'default' as const,
        memory,
        tools: ['tasks.list', 'task.message'],
        report: 'wake' as const,
        limits: { turns: 25, dollars: 2 },
      },
      limits: { turns: 25, dollars: 2 },
    },
  }));

  expect(pickCleanedTaskIDs(candidates, thread)).toStrictEqual(expected);
});
