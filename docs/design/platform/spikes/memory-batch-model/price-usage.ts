import type { Usage } from './run-writer.ts';

// Claude Haiku 5.5 list prices in USD per million tokens. Claude Code asks for the 1-hour cache, so
// a cache write costs twice the input price.
export const PRICES = { cacheRead: 0.01, cacheWrite: 0.2, input: 0.1, output: 0.5 };

export function priceUsage(usage: Usage): number {
  return (
    (usage.input * PRICES.input +
      usage.cacheWrite * PRICES.cacheWrite +
      usage.cacheRead * PRICES.cacheRead +
      usage.output * PRICES.output) /
    1e6
  );
}
