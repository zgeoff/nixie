import { expect, test } from 'bun:test';
import { isTypedYes } from './is-typed-yes';

test.each([
  ['yes', true],
  ['Yes!', true],
  ['YES PLEASE.', true],
  ['  yeah  ', true],
  ['go  ahead', true],
  ['okay!!', true],
  ['no', false],
  ['no thanks', false],
  ['yes, but it is blue', false],
  ['yes?', false],
  ['not yet', false],
  ['', false],
])('it reads %p as a plain yes: %p', (text, expected) => {
  expect(isTypedYes(text)).toBe(expected);
});
