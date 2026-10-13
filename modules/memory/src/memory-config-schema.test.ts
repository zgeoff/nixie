import { expect, test } from 'bun:test';
import { memoryConfigSchema } from './memory-config-schema';

test('it sets the gate, pinned core, retrieval and rebuild defaults', () => {
  expect(memoryConfigSchema.safeParse({}).data).toStrictEqual({
    limits: {
      evidenceWindow: 20,
      proposalLapseMs: 1_209_600_000,
      proposalCap: 10,
      closeMatchScore: 0.6,
    },
    checkerTimeoutMs: 20_000,
    pinnedCoreTokens: 2000,
    retrievalItems: 5,
    retrievalMinScore: 0.25,
    rebuildTokens: 30_000,
  });
});

test('it takes the values the file names', () => {
  const result = memoryConfigSchema.safeParse({
    pinned_core_tokens: 1500,
    retrieval_items: 3,
    retrieval_min_score: 0.5,
    rebuild_tokens: 20_000,
  });

  expect(result.data).toMatchObject({
    pinnedCoreTokens: 1500,
    retrievalItems: 3,
    retrievalMinScore: 0.5,
    rebuildTokens: 20_000,
  });
});

test('it refuses a pinned core with no budget', () => {
  const result = memoryConfigSchema.safeParse({ pinned_core_tokens: 0 });

  expect(result.error?.issues).toPartiallyContain({ path: ['pinned_core_tokens'] });
});

test('it refuses a negative score floor', () => {
  const result = memoryConfigSchema.safeParse({ retrieval_min_score: -1 });

  expect(result.error?.issues).toPartiallyContain({ path: ['retrieval_min_score'] });
});

test('it refuses an unknown key', () => {
  const result = memoryConfigSchema.safeParse({ retrieval_item: 5 });

  expect(result.error?.issues).toPartiallyContain({ path: [], keys: ['retrieval_item'] });
});
