import { expect, test } from 'bun:test';
import { compactionConfigSchema } from './compaction-config-schema';

test('it compacts at 0.8 of the window with a summary cap of 2,000 tokens when the file sets none', () => {
  expect(compactionConfigSchema.parse({})).toStrictEqual({ threshold: 0.8, summaryTokens: 2000 });
});

test('it reads the threshold and the summary cap the file sets', () => {
  const result = compactionConfigSchema.safeParse({ threshold: 0.6, summary_tokens: 3000 });

  expect(result.data).toStrictEqual({ threshold: 0.6, summaryTokens: 3000 });
});

test('it refuses a threshold past the whole window', () => {
  const result = compactionConfigSchema.safeParse({ threshold: 1.2, summary_tokens: 2000 });

  expect(result.error?.issues).toPartiallyContain({ path: ['threshold'] });
});

test('it refuses a threshold of zero', () => {
  const result = compactionConfigSchema.safeParse({ threshold: 0, summary_tokens: 2000 });

  expect(result.error?.issues).toPartiallyContain({ path: ['threshold'] });
});

test('it refuses a summary cap under 100 tokens', () => {
  const result = compactionConfigSchema.safeParse({ threshold: 0.8, summary_tokens: 50 });

  expect(result.error?.issues).toPartiallyContain({ path: ['summary_tokens'] });
});

test('it refuses an unknown key', () => {
  const result = compactionConfigSchema.safeParse({ threshold: 0.8, summary_words: 1500 });

  expect(result.error?.issues).toPartiallyContain({ code: 'unrecognized_keys' });
});
