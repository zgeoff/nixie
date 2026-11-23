import { expect, test } from 'bun:test';
import { computerConfigSchema } from './computer-config-schema';

test('it defaults the idle hand-back to 30 minutes', () => {
  expect(computerConfigSchema.parse({})).toStrictEqual({ idle_hand_back_minutes: 30 });
});

test('it takes a configured idle hand-back', () => {
  expect(computerConfigSchema.parse({ idle_hand_back_minutes: 5 })).toStrictEqual({
    idle_hand_back_minutes: 5,
  });
});

test.each([0, -1, 1.5])('it refuses an idle hand-back of %p minutes', (minutes) => {
  expect(computerConfigSchema.safeParse({ idle_hand_back_minutes: minutes }).success).toBeFalse();
});
