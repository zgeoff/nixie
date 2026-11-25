import { expect, test } from 'bun:test';
import type { SavedLayoutState } from './pick-layout-restore';
import { pickLayoutRestore } from './pick-layout-restore';

test.each([
  {
    title: 'a name that no saved layout has',
    layouts: [
      {
        name: 'evening',
        grid: { regions: [{ name: 'note' }] },
        states: [{ region: 'note', shownSequence: 4, isShown: true }],
      },
      { name: 'morning', grid: { regions: [{ name: 'clock' }] }, states: [] },
    ],
    name: 'weekend',
    expected: { status: 'unknown', names: ['evening', 'morning'] },
  },
  {
    title: 'a device with no saved layout',
    layouts: [],
    name: 'evening',
    expected: { status: 'unknown', names: [] },
  },
  {
    title: 'the asked name among several',
    layouts: [
      {
        name: 'evening',
        grid: { regions: [{ name: 'note' }] },
        states: [{ region: 'note', shownSequence: 4, isShown: true }],
      },
      {
        name: 'morning',
        grid: { regions: [{ name: 'clock' }] },
        states: [{ region: 'clock', shownSequence: 9, isShown: true }],
      },
    ],
    name: 'morning',
    expected: {
      status: 'restore',
      grid: { regions: [{ name: 'clock' }] },
      regions: ['clock'],
      kept: [{ region: 'clock', shownSequence: 9 }],
      emptied: [],
    },
  },
  {
    title: 'a region that still shows content',
    layouts: [
      {
        name: 'evening',
        grid: { regions: [{ name: 'note' }, { name: 'clock' }] },
        states: [{ region: 'note', shownSequence: 4, isShown: true }],
      },
    ],
    name: 'evening',
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
    layouts: [
      {
        name: 'evening',
        grid: { regions: [{ name: 'note' }, { name: 'clock' }] },
        states: [{ region: 'note', shownSequence: 4, isShown: false }],
      },
    ],
    name: 'evening',
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
    layouts: [
      {
        name: 'evening',
        grid: { regions: [{ name: 'note' }, { name: 'clock' }] },
        states: [{ region: 'garden', shownSequence: 4, isShown: false }],
      },
    ],
    name: 'evening',
    expected: {
      status: 'restore',
      grid: { regions: [{ name: 'note' }, { name: 'clock' }] },
      regions: ['note', 'clock'],
      kept: [],
      emptied: [],
    },
  },
])('#pickLayoutRestore gives the plan for $title', (row) => {
  const layouts: readonly SavedLayoutState<{ readonly regions: readonly { name: string }[] }>[] =
    row.layouts;

  expect(pickLayoutRestore(layouts, row.name)).toStrictEqual(row.expected);
});
