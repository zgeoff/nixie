import { expect, test } from 'bun:test';
import { formatSessionRelease } from './format-session-release';

test.each([
  {
    title: 'stops a session that nixie started',
    session: { origin: 'started', state: 'running', lastEventAt: null } as const,
    expected: 'This also stops its coding session.',
  },
  {
    title: 'leaves a joined session running',
    session: { origin: 'joined', state: 'idle', lastEventAt: null } as const,
    expected: 'Its coding session keeps running, as yours.',
  },
  { title: 'says nothing for a task with no session', session: undefined, expected: null },
])('#formatSessionRelease $title', (row) => {
  expect(formatSessionRelease(row.session)).toBe(row.expected);
});
