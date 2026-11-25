import { expect, test } from 'bun:test';
import { pickLayoutRestore } from './pick-layout-restore';

test.each([
  {
    title: 'a region that still shows content',
    saved: [{ region: 'note', shownSequence: 4, isShown: true }],
    expected: { kept: [{ region: 'note', shownSequence: 4 }], emptied: [] },
  },
  {
    title: 'a region that shows nothing now',
    saved: [{ region: 'note', shownSequence: 4, isShown: false }],
    expected: { kept: [], emptied: ['note'] },
  },
  {
    title: 'a region the grid does not hold',
    saved: [{ region: 'garden', shownSequence: 4, isShown: false }],
    expected: { kept: [], emptied: [] },
  },
])('#pickLayoutRestore gives the plan for $title', (row) => {
  expect(pickLayoutRestore(['note', 'clock'], row.saved)).toStrictEqual(row.expected);
});
