import { expect, test } from 'bun:test';
import { pickLayoutRemoval } from './pick-layout-removal';

test.each([
  {
    title: 'a saved name',
    name: 'evening',
    expected: { removed: true, names: ['morning'] },
  },
  {
    title: 'an unknown name',
    name: 'noon',
    expected: { removed: false, names: ['evening', 'morning'] },
  },
])('#pickLayoutRemoval gives the outcome for $title', (row) => {
  expect(pickLayoutRemoval(['evening', 'morning'], row.name)).toStrictEqual(row.expected);
});
