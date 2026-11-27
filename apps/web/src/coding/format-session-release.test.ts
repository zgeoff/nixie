import { expect, test } from 'bun:test';
import { formatSessionRelease } from './format-session-release';

test.each([
  {
    title: 'stops a session that nixie started',
    session: { origin: 'started', state: 'running', lastEventAt: null, isReleased: false } as const,
    expected: 'This also stops its coding session.',
  },
  {
    title: 'says nothing of a joined session',
    session: { origin: 'joined', state: 'idle', lastEventAt: null, isReleased: false } as const,
    expected: null,
  },
  {
    title: 'says nothing of a started session that the task let go of',
    session: { origin: 'started', state: 'ended', lastEventAt: null, isReleased: true } as const,
    expected: null,
  },
  {
    title: 'says nothing of a joined session that the task let go of',
    session: { origin: 'joined', state: 'idle', lastEventAt: null, isReleased: true } as const,
    expected: null,
  },
  { title: 'says nothing for a task with no session', session: undefined, expected: null },
])('#formatSessionRelease $title', (row) => {
  expect(formatSessionRelease(row.session)).toBe(row.expected);
});
