import { buildDurationSchema } from '@heynixie/clock';
import { z } from 'zod';

// The `model_credential` section: the day the model token that the deployment holds stops working.
// A token from `claude setup-token` never refreshes, so nixie cannot read its end and the deployment
// says it.
export const modelCredentialConfigSchema = z.strictObject({
  // when the token expires, with an offset, such as 2027-03-01T00:00:00Z
  expires_at: z.iso.datetime({ offset: true }),

  // how long before the expiry the session's status tells the model, once
  warn_before: buildDurationSchema('3d'),
});

export type ModelCredentialConfig = z.output<typeof modelCredentialConfigSchema>;
