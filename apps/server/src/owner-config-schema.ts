import { z } from 'zod';

// The owner section of the deployment configuration: the owner's name, which the conversation
// reads in place of "the owner", and the IANA time zone the conversation reads times in.
export const ownerConfigSchema = z
  .strictObject({
    name: z.string().min(1).optional(),
    time_zone: z
      .string()
      .refine((zone) => isTimeZone(zone), 'an IANA time zone, such as Europe/London')
      .default('UTC'),
  })
  .transform((config): OwnerConfig => ({ name: config.name ?? null, timeZone: config.time_zone }));

export interface OwnerConfig {
  // null when the file sets none, which reads as "the owner"
  readonly name: string | null;
  readonly timeZone: string;
}

function isTimeZone(zone: string): boolean {
  try {
    return new Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions().timeZone !== '';
  } catch {
    return false;
  }
}
