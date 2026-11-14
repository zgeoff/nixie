import { expect, test } from 'bun:test';
import { parseEnrolmentCode } from './parse-enrolment-code';

test('it reads the code from the first line that enrol-code prints', () => {
  const printed = 'KQ7PX-2M4RD\nThe code works once, until 2026-03-04T10:15:00.000Z.\n';

  expect(parseEnrolmentCode(printed)).toBe('KQ7PX-2M4RD');
});

test('it returns null when the first line holds no code', () => {
  expect(parseEnrolmentCode('nixie is not running\n')).toBeNull();
});
