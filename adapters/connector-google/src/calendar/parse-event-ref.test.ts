import { expect, test } from 'bun:test';
import { buildEventRef } from './build-event-ref';
import { parseEventRef } from './parse-event-ref';

test.each([
  {
    title: 'an event of primary',
    text: 'k3x9m2p7qa.a1b2c3d4e5',
    expected: { connection: 'k3x9m2p7qa', event: 'a1b2c3d4e5', calendar: 'primary' },
  },
  {
    title: 'an event of another calendar',
    text: 'k3x9m2p7qa.a1b2c3@team@group.calendar.google.com',
    expected: {
      connection: 'k3x9m2p7qa',
      event: 'a1b2c3',
      calendar: 'team@group.calendar.google.com',
    },
  },
  { title: 'text with no connection', text: 'a1b2c3', expected: null },
  { title: 'an ID that names no event', text: 'k3x9m2p7qa.@team', expected: null },
])('#parseEventRef reads $title', (row) => {
  expect(parseEventRef(row.text)).toStrictEqual(row.expected);
});

test('#buildEventRef gives an ID that #parseEventRef reads back', () => {
  const text = buildEventRef('k3x9m2p7qa', 'a1b2c3', 'team@group.calendar.google.com');

  expect(parseEventRef(text)).toStrictEqual({
    connection: 'k3x9m2p7qa',
    event: 'a1b2c3',
    calendar: 'team@group.calendar.google.com',
  });
});
