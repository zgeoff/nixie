import { deploymentReference } from '@heynixie/credentials';
import { z } from 'zod';

export const searchConfigSchema = z.strictObject({
  daily_call_cap: z.number().int().positive().default(200),
  credential: deploymentReference,

  // what one search costs, in millionths of a dollar, and the API's base URL; each defaults to the
  // search adapter's own value
  price_micros: z.number().int().positive().optional(),
  api_url: z.url({ protocol: /^https$/u }).optional(),
});

export type SearchConfig = z.infer<typeof searchConfigSchema>;
