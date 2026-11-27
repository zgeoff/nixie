import { buildDurationSchema } from '@heynixie/clock';
import { z } from 'zod';

// The `gmail` section of the deployment config. The duration takes the text that parseDuration
// reads, such as 30s, 2m or 1h.
export const gmailConfigSchema = z.strictObject({
  // how often the source polls each Google connection for new mail
  poll_interval: buildDurationSchema('2m'),
});
