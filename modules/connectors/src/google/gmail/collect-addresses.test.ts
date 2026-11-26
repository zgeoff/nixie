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
  {
    title: 'a group with members',
    header: 'Team: Sam <sam@example.org>, kim@example.org;',
    expected: ['sam@example.org', 'kim@example.org'],
  },
  {
    title: 'a group between 2 addresses',
    header: 'a@example.org, Team: b@example.org;, c@example.org',
    expected: ['a@example.org', 'b@example.org', 'c@example.org'],
  },
  {
    title: 'a group member with a comment after it',
    header: 'Team: a@example.org (on call), b@example.org;',
    expected: ['a@example.org', 'b@example.org'],
  },
  {
    title: 'a comment with a comma, a nested comment and a bracket in it',
    header: 'Sam (lee, (the <boss>)) <sam@example.org>, kim@example.org (a)',
    expected: ['sam@example.org', 'kim@example.org'],
  },
  {
    title: 'a parenthesis inside a quoted name',
    header: '"Lee (Sam" <sam@example.org>, kim@example.org',
    expected: ['sam@example.org', 'kim@example.org'],
  },
  { title: 'an empty header', header: '', expected: [] },
])('it collects the bare addresses of $title', (row) => {
  expect(collectAddresses(row.header)).toStrictEqual([...row.expected]);
});
