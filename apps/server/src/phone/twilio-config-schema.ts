import { deploymentReference } from '@heynixie/credentials';
import { z } from 'zod';

// The `twilio` section of the `phone` section: the account and the API key that the adapter signs
// in with. The key's secret comes from the credential store, and the account's number sits in the
// phone module's own keys.
export const twilioConfigSchema = z.strictObject({
  account_sid: z
    .string()
    .regex(/^AC[0-9a-f]{32}$/iu, 'an account SID, such as AC followed by 32 hex digits'),

  // the user of the API key's HTTP Basic sign-in
  api_key_sid: z
    .string()
    .regex(/^SK[0-9a-f]{32}$/iu, 'an API key SID, such as SK followed by 32 hex digits'),

  // the entry that holds the API key's secret
  credential: deploymentReference,
  api_url: z.url({ protocol: /^https$/u }).default('https://api.twilio.com'),
});

export type TwilioConfig = z.output<typeof twilioConfigSchema>;
