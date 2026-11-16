import { expect, test } from 'bun:test';
import { isGuestPurged, pickCleanedTaskIDs } from './pick-cleaned-task-ids';

test('it picks only the tasks that read memory for a forgotten memory item or a destroyed moment', () => {
  expect(
    pickCleanedTaskIDs(
      [
        {
          taskID: 'tide-tables',
          setup: {
            kind: 'started',
            runner: 'sandbox',
            startedBy: 'conversation',
            report: 'wake',
            options: {
              model: null,
              profile: null,
              persona: 'default',
              memory: 'read',
              log: 'own',
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
            kind: 'started',
            runner: 'sandbox',
            startedBy: 'conversation',
            report: 'wake',
            options: {
              model: null,
              profile: null,
              persona: 'none',
              memory: 'none',
              log: 'own',
              tools: ['tasks.list', 'task.message'],
              report: 'wake',
              limits: { turns: 25, dollars: 2 },
            },
            limits: { turns: 25, dollars: 2 },
          },
        },
        {
          taskID: 'moved-message',
          setup: {
            kind: 'started',
            runner: 'sandbox',
            startedBy: 'owner',
            report: null,
            options: null,
            limits: null,
          },
        },
        { taskID: 'the-conversation', setup: { kind: 'fixed' } },
        { taskID: 'gone', setup: null },
      ],
      null,
    ),
  ).toStrictEqual(['tide-tables']);
});

test('it picks the task of a definition whether or not its version reads memory', () => {
  expect(
    pickCleanedTaskIDs(
      [
        {
          taskID: 'water-tomatoes',
          setup: { kind: 'definition', definitionID: 'water-the-tomatoes', definitionHash: 'h1' },
        },
        {
          taskID: 'spent-errand',
          setup: { kind: 'definition', definitionID: 'spent-errand', definitionHash: null },
        },
      ],
      null,
    ),
  ).toStrictEqual(['water-tomatoes', 'spent-errand']);
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
      kind: 'started' as const,
      runner: 'sandbox',
      startedBy: 'conversation',
      report: 'wake' as const,
      options: {
        model: null,
        profile: null,
        persona: 'default' as const,
        memory,
        log: 'own' as const,
        tools: ['tasks.list', 'task.message'],
        report: 'wake' as const,
        limits: { turns: 25, dollars: 2 },
      },
      limits: { turns: 25, dollars: 2 },
    },
  }));

  expect(pickCleanedTaskIDs(candidates, thread)).toStrictEqual(expected);
});

test.each([
  ['a conversation record and a task with the grant', 'conversation', 'conversation', ['wave-log']],
  ['a conversation record and a task without the grant', 'conversation', 'own', []],
  ['a record of another thread and a task with the grant', 'reef-census', 'conversation', []],
] as const)('it picks the tasks for %s', (_title, thread, log, expected) => {
  const candidates = [
    {
      taskID: 'wave-log',
      setup: {
        kind: 'started' as const,
        runner: 'sandbox',
        startedBy: 'conversation',
        report: 'wake' as const,
        options: {
          model: null,
          profile: null,
          persona: 'default' as const,
          memory: 'none' as const,
          log,
          tools: ['tasks.list', 'task.message'],
          report: 'wake' as const,
          limits: { turns: 25, dollars: 2 },
        },
        limits: { turns: 25, dollars: 2 },
      },
    },
  ];

  expect(pickCleanedTaskIDs(candidates, thread)).toStrictEqual(expected);
});
