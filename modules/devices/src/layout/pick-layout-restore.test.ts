import { expect, test } from 'bun:test';
import { pickLayoutRestore } from './pick-layout-restore';

test.each([
  {
    title: 'a name that no saved layout has',
    input: { names: ['evening', 'morning'], found: null },
    expected: { status: 'unknown', names: ['evening', 'morning'] },
  },
  {
    title: 'a region that still shows content',
    input: {
      names: ['evening'],
      found: {
        grid: { regions: [{ name: 'note' }, { name: 'clock' }] },
        states: [{ region: 'note', shownSequence: 4, isShown: true }],
      },
    },
    expected: {
      status: 'restore',
      grid: { regions: [{ name: 'note' }, { name: 'clock' }] },
      regions: ['note', 'clock'],
      kept: [{ region: 'note', shownSequence: 4 }],
      emptied: [],
    },
  },
  {
    title: 'a region whose content no longer shows',
    input: {
      names: ['evening'],
      found: {
        grid: { regions: [{ name: 'note' }, { name: 'clock' }] },
        states: [{ region: 'note', shownSequence: 4, isShown: false }],
      },
    },
    expected: {
      status: 'restore',
      grid: { regions: [{ name: 'note' }, { name: 'clock' }] },
      regions: ['note', 'clock'],
      kept: [],
      emptied: ['note'],
    },
  },
  {
    title: 'a region the grid does not hold',
    input: {
      names: ['evening'],
      found: {
        grid: { regions: [{ name: 'note' }, { name: 'clock' }] },
        states: [{ region: 'garden', shownSequence: 4, isShown: false }],
      },
    },
    expected: {
      status: 'restore',
      grid: { regions: [{ name: 'note' }, { name: 'clock' }] },
      regions: ['note', 'clock'],
      kept: [],
      emptied: [],
    },
  },
])('#pickLayoutRestore gives the plan for $title', (row) => {
  expect(pickLayoutRestore(row.input)).toStrictEqual(row.expected);
});
