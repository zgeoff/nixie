import { z } from 'zod';
import type { ModelPrices } from './types';

const priceSchema = z.number().nonnegative();

export const modelPricesSchema = z
  .strictObject({
    input: priceSchema,
    cache_write: priceSchema,
    cache_write_1h: priceSchema,
    cached_input: priceSchema,
    output: priceSchema,
  })
  .transform((prices): ModelPrices => ({
    input: prices.input,
    cacheWrite: prices.cache_write,
    cacheWrite1h: prices.cache_write_1h,
    cachedInput: prices.cached_input,
    output: prices.output,
  }));
