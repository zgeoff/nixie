import { deploymentReference } from '@heynixie/credentials';
import { z } from 'zod';

export const searchConfigSchema = z.strictObject({
  daily_call_cap: z.number().int().positive().default(200),
  credential: deploymentReference.nullable().default(null),

  // what one search costs, in millionths of a dollar: Kagi's price list charges $12 for 1000
  // searches (https://kagi.com/api/pricing)
  price_micros: z.number().int().positive().default(12_000),
  api_url: z.url({ protocol: /^https$/u }).default('https://kagi.com/api/v1'),
});

export type SearchConfig = z.infer<typeof searchConfigSchema>;
