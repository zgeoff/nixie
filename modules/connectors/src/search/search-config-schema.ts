import { deploymentReference } from '@heynixie/credentials';
import { z } from 'zod';

export const searchConfigSchema = z.strictObject({
  daily_call_cap: z.number().int().positive().default(200),
  credential: deploymentReference.nullable().default(null),
  api_url: z.url({ protocol: /^https$/u }).default('https://kagi.com/api/v1'),
});

export type SearchConfig = z.infer<typeof searchConfigSchema>;
