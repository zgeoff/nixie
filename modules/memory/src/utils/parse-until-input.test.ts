import { expect, test } from 'bun:test';
import { parseUntilInput } from './parse-until-input';

test('it leaves the end time unset when the input names none', () => {
  expect(parseUntilInput(undefined)).toStrictEqual({ status: 'valid' });
});

test('it clears the end time when the input is null', () => {
  expect(parseUntilInput(null)).toStrictEqual({ status: 'valid', until: null });
});

test('it reads a time with an offset as the same instant in UTC', () => {
  expect(parseUntilInput('2026-10-25T23:59:59+01:00')).toStrictEqual({
    status: 'valid',
    until: Date.parse('2026-10-25T22:59:59Z'),
  });
});

test('it refuses a time on a day the calendar lacks', () => {
  expect(parseUntilInput('2026-02-29T23:59:59+00:00')).toStrictEqual({
    status: 'invalid',
    message:
      'until 2026-02-29T23:59:59+00:00 is not a real ISO time with an offset, such as 2026-10-19T23:59:59+01:00',
  });
});

test('it refuses a time with no offset', () => {
  expect(parseUntilInput('2026-10-25T23:59:59')).toMatchObject({ status: 'invalid' });
});
