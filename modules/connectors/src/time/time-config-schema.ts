import { isTimeZone } from '@heynixie/contract';
import { z } from 'zod';
import { hasQuarterHourOffsets } from './has-quarter-hour-offsets';

// A winter and a summer instant of the year of this check cover a zone's clock change.
const checkedInstantsMs = [Date.UTC(2026, 0, 1), Date.UTC(2026, 6, 1)];

export const timeConfigSchema = z.strictObject({
  default_zone: z
    .string()
    .refine((zone) => isTimeZone(zone), { message: 'expected an IANA time zone', abort: true })
    .refine((zone) => hasQuarterHourOffsets(zone, checkedInstantsMs), {
      message: 'expected a zone whose offset from UTC is a whole number of 15 minutes',
    })
    .default('Australia/Sydney'),
});
