import { expect, test } from 'bun:test';
import { parseListedSession } from './parse-listed-session';

test.each([
  {
    title: 'a session with its last event',
    fields: { session: { origin: 'started', state: 'waiting', lastEventAt: 1_794_550_000_000 } },
    expected: {
      origin: 'started',
      state: 'waiting',
      lastEventAt: new Date(1_794_550_000_000),
    },
  },
  {
    title: 'a session with no event yet',
    fields: { session: { origin: 'joined', state: 'idle', lastEventAt: null } },
    expected: { origin: 'joined', state: 'idle', lastEventAt: null },
  },
  { title: 'fields with no session', fields: { limits: null }, expected: undefined },
  { title: 'no fields', fields: undefined, expected: undefined },
  {
    title: 'a state that no session has',
    fields: { session: { origin: 'started', state: 'dancing', lastEventAt: null } },
    expected: undefined,
  },
])('#parseListedSession reads $title', (row) => {
  expect(parseListedSession(row.fields)).toStrictEqual(row.expected);
});
