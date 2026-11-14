import { z } from 'zod';

export interface PolicyConfig {
  readonly consent: { readonly linkMaxAgeMs: number };
}

const millisecondsPerHour = 3_600_000;

export const policyConfigSchema = z
  .strictObject({
    consent: z
      .strictObject({
        link_max_age: z
          .number()
          .positive()
          .default(24)
          .describe(
            'Hours from when you typed a message. A message that a task passes on carries your consent for this long.',
          ),
      })
      .default({ link_max_age: 24 }),
  })
  .transform((config): PolicyConfig => ({
    consent: { linkMaxAgeMs: config.consent.link_max_age * millisecondsPerHour },
  }));
