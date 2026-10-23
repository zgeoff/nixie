import { z } from 'zod';
import type { ModelPrices, PriceRates } from './types';

const priceSchema = z.number().nonnegative();

const rateSchema = z.strictObject({
  input: priceSchema,
  cache_write: priceSchema,
  cache_write_1h: priceSchema,
  cached_input: priceSchema,
  output: priceSchema,
});

export const modelPricesSchema = rateSchema
  .extend({ long_prompt: rateSchema.extend({ over_tokens: z.int().positive() }).optional() })
  .transform((prices): ModelPrices => ({
    ...toPriceRates(prices),
    ...(prices.long_prompt === undefined
      ? {}
      : {
          longPrompt: {
            overTokens: prices.long_prompt.over_tokens,
            ...toPriceRates(prices.long_prompt),
          },
        }),
  }));

function toPriceRates(rates: z.output<typeof rateSchema>): PriceRates {
  return {
    input: rates.input,
    cacheWrite: rates.cache_write,
    cacheWrite1h: rates.cache_write_1h,
    cachedInput: rates.cached_input,
    output: rates.output,
  };
}
