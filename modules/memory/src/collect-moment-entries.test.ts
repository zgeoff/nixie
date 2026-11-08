import { expect, test } from 'bun:test';
import { collectMomentEntries } from './collect-moment-entries';
import { buildMockMomentRow } from './test-utils/build-mock-moment-row';

test.each([
  {
    state: 'active',
    text: 'Boiler service booked',
    indexed: [{ itemID: 'moment-1', text: 'Boiler service booked' }],
    removedIDs: [],
  },
  {
    state: 'retired',
    text: 'Boiler service booked',
    indexed: [{ itemID: 'moment-1', text: 'Boiler service booked' }],
    removedIDs: [],
  },
  { state: 'destroying', text: 'Boiler service booked', indexed: [], removedIDs: ['moment-1'] },
  { state: 'destroyed', text: '', indexed: [], removedIDs: ['moment-1'] },
  { state: 'active', text: '  ', indexed: [], removedIDs: ['moment-1'] },
] as const)(
  'it indexes a $state moment with text "$text" only while it can be searched and has text',
  (row) => {
    const entries = collectMomentEntries(
      [buildMockMomentRow({ moment_id: 'moment-1', state: row.state, updated_sequence: 9 })],
      new Map([['moment-1', row.text]]),
      4,
    );

    expect(entries).toStrictEqual({
      entries: [...row.indexed],
      removedIDs: [...row.removedIDs],
      through: 9,
    });
  },
);

test('it reads through the newest updated sequence among the rows', () => {
  const entries = collectMomentEntries(
    [
      buildMockMomentRow({ moment_id: 'moment-1', updated_sequence: 12 }),
      buildMockMomentRow({ moment_id: 'moment-2', updated_sequence: 15 }),
    ],
    new Map([
      ['moment-1', 'Boiler service booked'],
      ['moment-2', 'Walk along the canal'],
    ]),
    10,
  );

  expect(entries.through).toBe(15);
});

test('it keeps the sequence it read through when no moment changed', () => {
  expect(collectMomentEntries([], new Map(), 10)).toStrictEqual({
    entries: [],
    removedIDs: [],
    through: 10,
  });
});
