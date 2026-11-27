import { expect, test } from 'bun:test';
import { collectDaemonsNotUp } from './collect-daemons-not-up';

test.each([
  {
    title: 'a configured daemon that is up',
    daemons: [{ name: 'cloud', state: 'up' }],
    expected: [],
  },
  {
    title: 'a configured daemon that is down',
    daemons: [{ name: 'cloud', state: 'down' }],
    expected: [{ name: 'cloud', state: 'down' }],
  },
  {
    title: 'a configured daemon that the registry does not name',
    daemons: [{ name: 'laptop', state: 'up' }],
    expected: [{ name: 'cloud', state: 'missing' }],
  },
  {
    title: 'a daemon that is down and is not configured',
    daemons: [
      { name: 'cloud', state: 'up' },
      { name: 'laptop', state: 'down' },
    ],
    expected: [],
  },
])('#collectDaemonsNotUp gives $expected for $title', (row) => {
  expect(
    collectDaemonsNotUp(row.daemons, [
      { daemon: 'cloud', target: 'cloud' },
      { daemon: 'cloud', target: 'scratch' },
    ]),
  ).toStrictEqual([...row.expected]);
});
