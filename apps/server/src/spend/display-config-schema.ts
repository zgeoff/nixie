import { z } from 'zod';

// Counts and limits stay in US dollars. This only changes what the client shows beside each figure.
export const displayConfigSchema = z.strictObject({
  // the currency whose rate against one US dollar the server reads once a day
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/u)
    .refine((currency) => currency !== 'USD', 'US dollars show as they are'),

  // the rate source's base URL
  rates_url: z.url({ protocol: /^https?$/u }).default('https://api.frankfurter.dev/v1'),
});

export type DisplayConfig = z.infer<typeof displayConfigSchema>;
