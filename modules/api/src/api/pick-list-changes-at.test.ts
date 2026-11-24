import { expect, test } from 'bun:test';
import { pickListChangesAt } from './pick-list-changes-at';

test.each([
  ['no task', [], null],
  ['a task with no next run', [{}], null],
  ['a next run that is due already', [{ nextRunAt: '2026-11-24T07:59:00.000Z' }], null],
  [
    'the earliest of 2 upcoming runs',
    [{ nextRunAt: '2026-11-25T09:00:00.000Z' }, { nextRunAt: '2026-11-24T09:00:00.000Z' }],
    new Date('2026-11-24T09:00:00Z'),
  ],
  [
    'an upcoming run beside a due one',
    [{ nextRunAt: '2026-11-24T07:00:00.000Z' }, { nextRunAt: '2026-11-24T10:00:00.000Z' }],
    new Date('2026-11-24T10:00:00Z'),
  ],
])('#pickListChangesAt reads %s', (_title, tasks, expected) => {
  expect(pickListChangesAt(tasks, Date.parse('2026-11-24T08:00:00Z'))).toStrictEqual(expected);
});
