import { expect, test } from 'bun:test';
import { writerConfigSchema } from './writer-config-schema';

test('it fills every default and turns each time into milliseconds', () => {
  expect(writerConfigSchema.parse({})).toStrictEqual({
    batchMessages: 4,
    batchTokens: 12_000,
    idleMs: 300_000,
    maxAgeMs: 1_200_000,
    paceMs: 12_000,
    itemListTokens: 8000,
    topItems: 20,
    proposalCap: 10,
    firstBackoffMs: 30_000,
    maxBackoffMs: 3_600_000,
  });
});

test('it turns a full configuration into the writer config', () => {
  const result = writerConfigSchema.safeParse({
    batch_messages: 6,
    batch_tokens: 9000,
    idle_minutes: 2.5,
    max_age_minutes: 30,
    batches_per_hour: 7,
    item_list_tokens: 4000,
    top_items: 100,
    proposal_cap: 3,
    first_backoff_seconds: 15,
    max_backoff_minutes: 10,
  });

  expect(result.data).toStrictEqual({
    batchMessages: 6,
    batchTokens: 9000,
    idleMs: 150_000,
    maxAgeMs: 1_800_000,
    paceMs: 514_286,
    itemListTokens: 4000,
    topItems: 100,
    proposalCap: 3,
    firstBackoffMs: 15_000,
    maxBackoffMs: 600_000,
  });
});

test('it rounds each time to whole milliseconds, never below 1 ms for a backoff', () => {
  const result = writerConfigSchema.safeParse({
    idle_minutes: 0.00001,
    max_age_minutes: 0.00001,
    first_backoff_seconds: 0.0004,
    max_backoff_minutes: 0.000001,
  });

  expect(result.data).toMatchObject({ idleMs: 1, maxAgeMs: 1, firstBackoffMs: 1, maxBackoffMs: 1 });
});

test('it rejects a top items count over 100', () => {
  const result = writerConfigSchema.safeParse({
    batch_messages: 6,
    batch_tokens: 9000,
    idle_minutes: 2.5,
    max_age_minutes: 30,
    batches_per_hour: 7,
    item_list_tokens: 4000,
    top_items: 101,
    proposal_cap: 3,
    first_backoff_seconds: 15,
    max_backoff_minutes: 10,
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['top_items'] });
});

test('it rejects a batch size that is not a whole number', () => {
  const result = writerConfigSchema.safeParse({
    batch_messages: 2.5,
    batch_tokens: 9000,
    idle_minutes: 2.5,
    max_age_minutes: 30,
    batches_per_hour: 7,
    item_list_tokens: 4000,
    top_items: 100,
    proposal_cap: 3,
    first_backoff_seconds: 15,
    max_backoff_minutes: 10,
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['batch_messages'] });
});

test('it rejects an idle time of zero', () => {
  const result = writerConfigSchema.safeParse({
    batch_messages: 6,
    batch_tokens: 9000,
    idle_minutes: 0,
    max_age_minutes: 30,
    batches_per_hour: 7,
    item_list_tokens: 4000,
    top_items: 100,
    proposal_cap: 3,
    first_backoff_seconds: 15,
    max_backoff_minutes: 10,
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['idle_minutes'] });
});
