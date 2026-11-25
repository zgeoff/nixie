import { buildDurationSchema } from '@heynixie/clock';
import { z } from 'zod';

// The `mail` section of the deployment config. Without it nixie has no mailbox, and starts as it
// does today. The durations take the text that parseDuration reads, such as 30s, 5m or 2h.
export const mailConfigSchema = z.strictObject({
  // the assistant's own address, which its mail host serves
  address: z.email(),

  // how often the source reads the host
  host_poll_interval: buildDurationSchema('30s'),
});

export type MailConfig = z.output<typeof mailConfigSchema>;
