import { expect, test } from 'bun:test';
import { parseEnrolmentCode } from './parse-enrolment-code';

test('it reads the code from the first line', () => {
  expect(
    parseEnrolmentCode('K7QX-P2MD\nThe code works once, until 2026-10-11T16:15:00.000Z.\n'),
  ).toBe('K7QX-P2MD');
});

test('it refuses output with no code on its first line', () => {
  expect(() => parseEnrolmentCode('\nThe code works once.\n')).toThrowWithMessage(
    Error,
    String.raw`enrol-code printed no code on its first line: "\nThe code works once.\n"`,
  );
});

test('it refuses a first line that is a sentence', () => {
  expect(() => parseEnrolmentCode('nixie has no command enrol-code\n')).toThrow();
});
