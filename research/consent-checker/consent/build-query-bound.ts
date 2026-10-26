import { queryLimits } from './types.ts';

// Dollars per million tokens, from Anthropic's model price list.
const pricesPerMTok: Readonly<Record<string, { input: number; output: number }>> = {
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
};

// A one-hour cache write costs twice the input price, the most any input token costs.
const cacheWriteFactor = 2;

// The most one paid query can cost. Each token covers at least one byte of the request, so the bytes
// of the prompt and the input over-count their tokens. The client adds at most the overhead to each
// request, and each request after the first resends up to one full output and the overhead before it.
export function buildQueryBoundUSD(model: string, promptBytes: number): number {
  const price = pricesPerMTok[model];

  if (price === undefined) {
    throw new Error(
      `no price is known for ${model}, so no reservation can hold what its calls cost`,
    );
  }

  const requests = Array.from({ length: queryLimits.requestCap }, (_, request) => {
    const inputTokens =
      promptBytes +
      queryLimits.overheadBytes +
      request * (queryLimits.maxOutputTokens + queryLimits.overheadBytes);

    return (
      (inputTokens * cacheWriteFactor * price.input + queryLimits.maxOutputTokens * price.output) /
      1_000_000
    );
  });

  return requests.reduce((total, costUSD) => total + costUSD, 0);
}
