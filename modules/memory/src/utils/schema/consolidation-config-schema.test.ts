import { expect, test } from 'bun:test';
import { consolidationConfigSchema } from './consolidation-config-schema';

test('it runs weekly with at most 30 changes when the file sets nothing', () => {
  expect(consolidationConfigSchema.parse({})).toStrictEqual({
    isEnabled: true,
    periodMs: 604_800_000,
    maxChanges: 30,
    itemListTokens: 24_000,
    topItems: 20,
    lapseMs: 604_800_000,
    retryMs: 3_600_000,
  });
});

test('it reads each setting the file gives', () => {
  const result = consolidationConfigSchema.safeParse({
    enabled: false,
    period_days: 3,
    max_changes: 12,
    item_list_tokens: 8000,
    top_items: 10,
    lapse_days: 2,
    retry_minutes: 15,
  });

  expect(result.data).toStrictEqual({
    isEnabled: false,
    periodMs: 259_200_000,
    maxChanges: 12,
    itemListTokens: 8000,
    topItems: 10,
    lapseMs: 172_800_000,
    retryMs: 900_000,
  });
});

test('it refuses a diff of more than 30 changes', () => {
  const result = consolidationConfigSchema.safeParse({
    period_days: 3,
    max_changes: 31,
    item_list_tokens: 8000,
    top_items: 10,
    lapse_days: 2,
    retry_minutes: 15,
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['max_changes'] });
});

test('it refuses a setting it does not know', () => {
  const result = consolidationConfigSchema.safeParse({ period_days: 3, forget: true });

  expect(result.error?.issues).toPartiallyContain({ code: 'unrecognized_keys' });
});
