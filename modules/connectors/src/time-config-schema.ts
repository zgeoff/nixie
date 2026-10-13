import { isTimeZone } from '@heynixie/contract';
import { z } from 'zod';

// The time section of the deployment configuration: the IANA zone the time tool answers in until
// one of the owner's messages carries a zone.
export const timeConfigSchema = z.strictObject({
  default_zone: z
    .string()
    .refine((zone) => isTimeZone(zone), { message: 'expected an IANA time zone' })
    .default('Australia/Sydney'),
});
