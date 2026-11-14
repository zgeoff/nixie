import { isTimeZone } from '@heynixie/contract';
import { z } from 'zod';

export const timeConfigSchema = z.strictObject({
  default_zone: z
    .string()
    .refine((zone) => isTimeZone(zone), { message: 'expected an IANA time zone' })
    .default('Australia/Sydney'),
});
