import { expect, test } from 'bun:test';
import { pickCalendarWrittenRefusal } from './pick-calendar-written-refusal';

test('#pickCalendarWrittenRefusal accepts one write that emails the guest', () => {
  expect(
    pickCalendarWrittenRefusal(
      [{ method: 'POST', sendUpdates: 'all', title: 'Lunch', guests: ['lee@example.org'] }],
      { count: 1, sendUpdates: 'all', guest: 'Lee@example.org' },
    ),
  ).toBeNull();
});

test.each([
  { title: 'no write', writes: [], expected: 'the fake Calendar took 0 event writes, not 1' },
  {
    title: 'a double write',
    writes: [
      { method: 'POST', sendUpdates: 'all', title: 'Lunch', guests: ['lee@example.org'] },
      { method: 'POST', sendUpdates: 'all', title: 'Lunch', guests: ['lee@example.org'] },
    ],
    expected: 'the fake Calendar took 2 event writes, not 1',
  },
  {
    title: 'a write that emails no one',
    writes: [{ method: 'POST', sendUpdates: 'none', title: 'Lunch', guests: ['lee@example.org'] }],
    expected: 'the last write asked for sendUpdates none, not all',
  },
  {
    title: 'a write with another guest',
    writes: [{ method: 'POST', sendUpdates: 'all', title: 'Lunch', guests: ['kim@example.org'] }],
    expected: 'the written event has the guests kim@example.org, not lee@example.org',
  },
])('#pickCalendarWrittenRefusal refuses $title', (row) => {
  expect(
    pickCalendarWrittenRefusal(row.writes, {
      count: 1,
      sendUpdates: 'all',
      guest: 'lee@example.org',
    }),
  ).toBe(row.expected);
});
