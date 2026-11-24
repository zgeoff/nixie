import { expect, test } from 'bun:test';
import { pickLiveStart } from './pick-live-start';

test.each([
  ['an afterSequence below the head', { afterSequence: 40, lastEventID: undefined, head: 100 }, 40],
  [
    'an afterSequence past the head',
    { afterSequence: 500, lastEventID: undefined, head: 100 },
    100,
  ],
  ['no start at all', { afterSequence: undefined, lastEventID: undefined, head: 100 }, 100],
  [
    'a last event ID before the afterSequence',
    { afterSequence: 90, lastEventID: '60', head: 100 },
    60,
  ],
  ['a last event ID past the head', { afterSequence: 10, lastEventID: '900', head: 100 }, 100],
  ['a last event ID that is no sequence', { afterSequence: 10, lastEventID: 'abc', head: 100 }, 10],
  [
    'a last event ID of 16 digits',
    { afterSequence: 10, lastEventID: '1234567890123456', head: 100 },
    10,
  ],
  ['an empty last event ID', { afterSequence: 10, lastEventID: '', head: 100 }, 10],
])('#pickLiveStart starts from %s', (_title, starts, expected) => {
  expect(pickLiveStart(starts)).toBe(expected);
});
