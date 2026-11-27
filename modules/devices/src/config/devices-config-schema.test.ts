import { expect, test } from 'bun:test';
import { devicesConfigSchema } from './devices-config-schema';

test('it takes an empty section', () => {
  expect(devicesConfigSchema.parse({})).toStrictEqual({});
});

test('it refuses a field it does not know', () => {
  expect(devicesConfigSchema.safeParse({ screens: 2 }).success).toBeFalse();
});
