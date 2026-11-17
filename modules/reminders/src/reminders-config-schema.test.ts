import { expect, test } from 'bun:test';
import { remindersConfigSchema } from './reminders-config-schema';

test('it defaults the minimum gap to 15 minutes', () => {
  expect(remindersConfigSchema.parse({})).toStrictEqual({ min_gap_minutes: 15 });
});

test('it takes a whole number of minutes', () => {
  expect(remindersConfigSchema.parse({ min_gap_minutes: 30 })).toStrictEqual({
    min_gap_minutes: 30,
  });
});

test.each([0, 1.5, 'ten'])('it refuses a minimum gap of %p', (value) => {
  expect(remindersConfigSchema.safeParse({ min_gap_minutes: value }).success).toBeFalse();
});
