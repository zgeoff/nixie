import { expect, test } from 'bun:test';
import { collectAddresses } from './collect-addresses';

test.each([
  { title: 'a named address', header: 'Sam Lee <Sam@Example.org>', expected: ['sam@example.org'] },
  { title: 'a bare address', header: 'sam@example.org', expected: ['sam@example.org'] },
  {
    title: 'a name with a comma in quotes',
    header: '"Lee, Sam" <sam@example.org>, kim@example.org',
    expected: ['sam@example.org', 'kim@example.org'],
  },
  { title: 'a repeat', header: 'a@example.org, A@example.org', expected: ['a@example.org'] },
  { title: 'a group with no address', header: 'undisclosed-recipients:;', expected: [] },
  { title: 'an empty header', header: '', expected: [] },
])('it collects the bare addresses of $title', (row) => {
  expect(collectAddresses(row.header)).toStrictEqual([...row.expected]);
});
