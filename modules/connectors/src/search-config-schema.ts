import { z } from 'zod';

export const searchConfigSchema = z.strictObject({
  daily_call_cap: z.number().int().positive().default(200),
  credential: z
    .string()
    .regex(/^deployment:.+$/u, 'use deployment:<name>')
    .nullable()
    .default(null),
  api_url: z.url({ protocol: /^https$/u }).default('https://kagi.com/api/v1'),
});

export type SearchConfig = z.infer<typeof searchConfigSchema>;
