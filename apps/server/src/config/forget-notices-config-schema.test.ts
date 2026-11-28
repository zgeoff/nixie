import { expect, test } from 'bun:test';
import { forgetNoticesConfigSchema } from './forget-notices-config-schema';

test('it turns every notice on when the block sets nothing', () => {
  expect(forgetNoticesConfigSchema.parse({})).toStrictEqual({
    note: true,
    memory: true,
    moment: true,
    message: true,
  });
});

test.each(['note', 'memory', 'moment', 'message'] as const)(
  'it turns only the %s notice off with a key of false',
  (key) => {
    const all = { note: true, memory: true, moment: true, message: true };

    expect(forgetNoticesConfigSchema.parse({ [key]: false })).toStrictEqual({
      ...all,
      [key]: false,
    });
  },
);

test('it turns every notice off with a block of false', () => {
  expect(forgetNoticesConfigSchema.parse(false)).toStrictEqual({
    note: false,
    memory: false,
    moment: false,
    message: false,
  });
});

test('it rejects a block of true', () => {
  expect(forgetNoticesConfigSchema.safeParse(true).success).toBe(false);
});

test('it rejects an unknown key', () => {
  expect(forgetNoticesConfigSchema.safeParse({ record: true }).success).toBe(false);
});
