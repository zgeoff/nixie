import { expect, test } from 'bun:test';
import { renderTaskBoard } from './render-task-board';

test('it lists each task with its ID, name, state, last activity, wait and brief', () => {
  expect(
    renderTaskBoard(
      [
        {
          id: 'k3x9m2p7qa',
          name: 'Garden plan',
          state: 'waiting',
          brief: 'Plan four raised beds\nfor a spring sowing.',
          lastActivityAt: new Date('2026-10-14T09:40:00Z'),
          waitingOn: 'conversation',
        },
        {
          id: 'memory-writer',
          name: 'Memory writer',
          state: 'ready',
          brief: '',
          lastActivityAt: new Date('2026-10-14T08:00:00Z'),
        },
      ],
      { defaultZone: 'Australia/Sydney', now: new Date('2026-10-14T12:00:00Z') },
    ),
  ).toBe(
    [
      'Your tasks, the most recently active first. Pass work to one of them with task.message, and start a task with task.start only when none of them covers the work.',
      '- [k3x9m2p7qa] Garden plan · waiting · last active Wed 14 Oct, 20:40, Sydney · waits on conversation',
      '  Plan four raised beds for a spring sowing.',
      '- [memory-writer] Memory writer · ready · last active Wed 14 Oct, 19:00, Sydney',
    ].join('\n'),
  );
});

test('it cuts a long brief, since every turn repeats the board', () => {
  const board = renderTaskBoard(
    [
      {
        id: 'k3x9m2p7qa',
        name: 'Garden plan',
        state: 'waiting',
        brief: 'Sow beans. '.repeat(40),
        lastActivityAt: new Date('2026-10-14T09:40:00Z'),
      },
    ],
    { defaultZone: 'UTC', now: new Date('2026-10-14T12:00:00Z') },
  );

  expect(board?.split('\n').at(-1)).toBe(`  ${'Sow beans. '.repeat(18)}So…`);
});

test('it renders no board when there are no tasks', () => {
  expect(
    renderTaskBoard([], { defaultZone: 'UTC', now: new Date('2026-10-14T12:00:00Z') }),
  ).toBeNull();
});
