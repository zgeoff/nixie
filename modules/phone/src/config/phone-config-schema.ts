import { buildDurationSchema } from '@heynixie/clock';
import { z } from 'zod';

// The part of the `phone` section of the deployment config that the module reads. The adapter's own
// section sits beside it, and the phone module never reads that. Without the section nixie has no
// phone. The interval takes the text that parseDuration reads, such as 20s or 1m.
export const phoneConfigSchema = z.strictObject({
  // the assistant's own number, in E.164 form
  number: z.string().regex(/^\+[1-9]\d{6,14}$/u, 'a number in E.164 form, such as +61411111111'),

  // how often the source reads the provider's message list
  poll_interval: buildDurationSchema('20s'),
});

export type PhoneConfig = z.output<typeof phoneConfigSchema>;
