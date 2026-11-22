import { expect, test } from 'bun:test';
import { forgetNoticesConfigSchema } from './forget-notices-config-schema';

test('it turns the note notice on when the block sets nothing', () => {
  expect(forgetNoticesConfigSchema.parse({})).toStrictEqual({ note: true });
});

test('it turns the note notice off with a note key of false', () => {
  expect(forgetNoticesConfigSchema.parse({ note: false })).toStrictEqual({ note: false });
});

test('it turns every notice off with a block of false', () => {
  expect(forgetNoticesConfigSchema.parse(false)).toStrictEqual({ note: false });
});

test('it rejects a block of true', () => {
  expect(forgetNoticesConfigSchema.safeParse(true).success).toBe(false);
});

test('it rejects an unknown key', () => {
  expect(forgetNoticesConfigSchema.safeParse({ moment: true }).success).toBe(false);
});
