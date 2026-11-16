import { expect, test } from 'bun:test';
import { memoryConfigSchema } from './memory-config-schema';

test('it sets the gate, pinned core, trigger and rebuild defaults', () => {
  expect(memoryConfigSchema.safeParse({}).data).toStrictEqual({
    limits: {
      evidenceWindow: 20,
      proposalLapseMs: 1_209_600_000,
      proposalCap: 10,
      closeMatchScore: 0.6,
    },
    checkerTimeoutMs: 20_000,
    pinnedCoreTokens: 2000,
    turn: {
      trigger: { items: 3, minScore: 6.4, minSimilarity: 0.57 },
    },
    rebuildTokens: 30_000,
    index: { tokens: 3000, openTopicItems: 25, itemOrder: 'newest-first', topicPage: 200 },
  });
});

test.each([1, 2999, -1])('it refuses an index budget of %d', (tokens) => {
  const result = memoryConfigSchema.safeParse({ index_tokens: tokens });

  expect(result.error?.issues).toPartiallyContain({ path: ['index_tokens'] });
});

test.each([0, 3000, 5000])('it takes an index budget of %d', (tokens) => {
  const result = memoryConfigSchema.safeParse({ index_tokens: tokens });

  expect(result.data?.index.tokens).toBe(tokens);
});

test('it takes the index keys the file names', () => {
  const result = memoryConfigSchema.safeParse({
    index_open_topic_items: 10,
    index_item_order: 'newest-first',
    index_topic_page: 50,
  });

  expect(result.data?.index).toStrictEqual({
    tokens: 3000,
    openTopicItems: 10,
    itemOrder: 'newest-first',
    topicPage: 50,
  });
});

test('it refuses an index item order other than newest first', () => {
  const result = memoryConfigSchema.safeParse({ index_item_order: 'oldest-first' });

  expect(result.error?.issues).toPartiallyContain({ path: ['index_item_order'] });
});

test('it takes the values the file names', () => {
  const result = memoryConfigSchema.safeParse({
    pinned_core_tokens: 1500,
    trigger_items: 2,
    trigger_min_score: 4,
    trigger_min_similarity: 0.7,
    rebuild_tokens: 20_000,
  });

  expect(result.data).toMatchObject({
    pinnedCoreTokens: 1500,
    turn: {
      trigger: { items: 2, minScore: 4, minSimilarity: 0.7 },
    },
    rebuildTokens: 20_000,
  });
});

test('it refuses more than 20 trigger items a turn', () => {
  const result = memoryConfigSchema.safeParse({ trigger_items: 21 });

  expect(result.error?.issues).toPartiallyContain({ path: ['trigger_items'] });
});

test('it refuses a negative trigger floor', () => {
  const result = memoryConfigSchema.safeParse({ trigger_min_score: -1 });

  expect(result.error?.issues).toPartiallyContain({ path: ['trigger_min_score'] });
});

test('it refuses a pinned core with no budget', () => {
  const result = memoryConfigSchema.safeParse({ pinned_core_tokens: 0 });

  expect(result.error?.issues).toPartiallyContain({ path: ['pinned_core_tokens'] });
});

test('it refuses an unknown key', () => {
  const result = memoryConfigSchema.safeParse({ trigger_item: 5 });

  expect(result.error?.issues).toPartiallyContain({ path: [], keys: ['trigger_item'] });
});

test('it refuses a trigger similarity floor above 1', () => {
  const result = memoryConfigSchema.safeParse({ trigger_min_similarity: 1.5 });

  expect(result.error?.issues).toPartiallyContain({ path: ['trigger_min_similarity'] });
});
