import { expect, test } from 'bun:test';
import { computerConfigSchema } from './computer-config-schema';

test('it defaults the idle hand-back to 30 minutes and the ask expiry to 60', () => {
  expect(computerConfigSchema.parse({})).toStrictEqual({
    idle_hand_back_minutes: 30,
    handover_expiry_minutes: 60,
  });
});

test('it takes a configured idle hand-back', () => {
  expect(computerConfigSchema.parse({ idle_hand_back_minutes: 5 })).toStrictEqual({
    idle_hand_back_minutes: 5,
    handover_expiry_minutes: 60,
  });
});

test('it takes a configured ask expiry', () => {
  expect(computerConfigSchema.parse({ handover_expiry_minutes: 15 })).toStrictEqual({
    idle_hand_back_minutes: 30,
    handover_expiry_minutes: 15,
  });
});

test.each([0, -1, 1.5])('it refuses an idle hand-back of %p minutes', (minutes) => {
  expect(computerConfigSchema.safeParse({ idle_hand_back_minutes: minutes }).success).toBeFalse();
});

test.each([0, -1, 1.5])('it refuses an ask expiry of %p minutes', (minutes) => {
  expect(computerConfigSchema.safeParse({ handover_expiry_minutes: minutes }).success).toBeFalse();
});
