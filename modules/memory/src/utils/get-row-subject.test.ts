import { expect, test } from 'bun:test';
import { getRowSubject } from './get-row-subject';

test.each([
  ['fact', 'shared', 'shared'],
  ['self', 'self', 'self'],
  ['fact', null, 'owner'],
  ['self', null, 'self'],
] as const)('it reads a %s row with the subject %s as %s', (kind, subject, expected) => {
  expect(getRowSubject({ kind, subject })).toBe(expected);
});
