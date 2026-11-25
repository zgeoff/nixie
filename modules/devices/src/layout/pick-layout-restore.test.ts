import { expect, test } from 'bun:test';
import { pickLayoutRestore } from './pick-layout-restore';

test.each([
  {
    title: 'a region that still shows content',
    saved: {
      grid: { regions: [{ name: 'note' }, { name: 'clock' }] },
      states: [{ region: 'note', shownSequence: 4, isShown: true }],
    },
    expected: {
      grid: { regions: [{ name: 'note' }, { name: 'clock' }] },
      regions: ['note', 'clock'],
      kept: [{ region: 'note', shownSequence: 4 }],
      emptied: [],
    },
  },
  {
    title: 'a region whose content no longer shows',
    saved: {
      grid: { regions: [{ name: 'note' }, { name: 'clock' }] },
      states: [{ region: 'note', shownSequence: 4, isShown: false }],
    },
    expected: {
      grid: { regions: [{ name: 'note' }, { name: 'clock' }] },
      regions: ['note', 'clock'],
      kept: [],
      emptied: ['note'],
    },
  },
  {
    title: 'a region the grid does not hold',
    saved: {
      grid: { regions: [{ name: 'note' }, { name: 'clock' }] },
      states: [{ region: 'garden', shownSequence: 4, isShown: false }],
    },
    expected: {
      grid: { regions: [{ name: 'note' }, { name: 'clock' }] },
      regions: ['note', 'clock'],
      kept: [],
      emptied: [],
    },
  },
])('#pickLayoutRestore gives the plan for $title', (row) => {
  expect(pickLayoutRestore(row.saved)).toStrictEqual(row.expected);
});
