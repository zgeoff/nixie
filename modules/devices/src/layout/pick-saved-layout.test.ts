import { expect, test } from 'bun:test';
import { pickSavedLayout } from './pick-saved-layout';

test.each([
  {
    title: 'a name that no saved layout has',
    saved: [
      { name: 'evening', layoutSequence: 3 },
      { name: 'morning', layoutSequence: 8 },
    ],
    name: 'weekend',
    expected: { status: 'unknown', names: ['evening', 'morning'] },
  },
  {
    title: 'a device with no saved layout',
    saved: [],
    name: 'evening',
    expected: { status: 'unknown', names: [] },
  },
  {
    title: 'the asked name among several',
    saved: [
      { name: 'evening', layoutSequence: 3 },
      { name: 'morning', layoutSequence: 8 },
    ],
    name: 'morning',
    expected: { status: 'found', layout: { name: 'morning', layoutSequence: 8 } },
  },
])('#pickSavedLayout gives the choice for $title', (row) => {
  const saved: readonly { name: string; layoutSequence: number }[] = row.saved;

  expect(pickSavedLayout(saved, row.name)).toStrictEqual(row.expected);
});
