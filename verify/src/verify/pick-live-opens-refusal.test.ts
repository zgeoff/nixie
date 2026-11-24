import { expect, test } from 'bun:test';
import { pickLiveOpensRefusal } from './pick-live-opens-refusal';

test.each([
  { opened: 2, expected: undefined },
  { opened: 2, expected: 2 },
])('#pickLiveOpensRefusal accepts $opened opens when $expected are expected', (row) => {
  expect(pickLiveOpensRefusal(row.opened, row.expected)).toBeNull();
});

test('#pickLiveOpensRefusal refuses a count of opens that moved', () => {
  expect(pickLiveOpensRefusal(3, 2)).toBe('the browser opened its live stream 3 times, not 2');
});
