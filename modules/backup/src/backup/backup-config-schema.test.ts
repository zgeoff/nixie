import { expect, test } from 'bun:test';
import { backupConfigSchema } from './backup-config-schema';

test('it backs up every hour by default', () => {
  expect(backupConfigSchema.parse({})).toStrictEqual({ isEnabled: true, intervalMs: 3_600_000 });
});

test('it reads the interval in minutes', () => {
  expect(backupConfigSchema.parse({ enabled: false, interval_minutes: 15 })).toStrictEqual({
    isEnabled: false,
    intervalMs: 900_000,
  });
});

test('it refuses an interval of zero', () => {
  const result = backupConfigSchema.safeParse({ interval_minutes: 0 });

  expect(result.error?.issues).toPartiallyContain({ path: ['interval_minutes'] });
});
