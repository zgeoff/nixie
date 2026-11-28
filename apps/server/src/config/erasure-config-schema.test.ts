import { expect, test } from 'bun:test';
import { erasureConfigSchema } from './erasure-config-schema';

test('it expires payloads after 365 days when the config sets no age', () => {
  expect(erasureConfigSchema.parse({})).toStrictEqual({
    stuckAfterMs: 300_000,
    expireAfterMs: 31_536_000_000,
  });
});

test('it takes the age that a deployment sets, in days', () => {
  expect(erasureConfigSchema.parse({ expire_after_days: 30 }).expireAfterMs).toBe(2_592_000_000);
});

test('it refuses an age of zero days', () => {
  expect(() => erasureConfigSchema.parse({ expire_after_days: 0 })).toThrow();
});
