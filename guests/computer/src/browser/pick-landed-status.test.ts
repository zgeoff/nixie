import { expect, test } from 'bun:test';
import { pickLandedStatus } from './pick-landed-status';

test.each([
  {
    name: 'keeps a challenge when every read shows the landed page',
    seen: ['https://a.test/x', 'https://a.test/x#top', 'https://a.test/x'],
    status: 403,
    blocked: 'a challenge',
    expected: { status: 403, blocked: 'a challenge' },
  },
  {
    name: 'drops a challenge when the tab moved before the snapshot',
    seen: ['https://a.test/next', 'https://a.test/next', 'https://a.test/next'],
    status: 403,
    blocked: 'a challenge',
    expected: { status: 0, blocked: null },
  },
  {
    name: 'drops a challenge when the tab moved during the snapshot',
    seen: ['https://a.test/x', 'https://a.test/next', 'https://a.test/next'],
    status: 503,
    blocked: 'a challenge',
    expected: { status: 0, blocked: null },
  },
  {
    name: 'drops a challenge when the tab moved after the snapshot',
    seen: ['https://a.test/x', 'https://a.test/x', 'https://a.test/next'],
    status: 403,
    blocked: null,
    expected: { status: 0, blocked: null },
  },
  {
    name: 'keeps an ordinary status when the page rewrites its address',
    seen: ['https://a.test/x', 'https://a.test/y', 'https://a.test/y'],
    status: 200,
    blocked: null,
    expected: { status: 200, blocked: null },
  },
])('it $name', (row) => {
  expect(
    pickLandedStatus(
      { url: 'https://a.test/x', status: row.status, blocked: row.blocked },
      row.seen,
    ),
  ).toStrictEqual(row.expected);
});
