import { deploymentReference } from '@heynixie/credentials';
import { z } from 'zod';

// the pattern of each ID, for a plain value and for a settings entry's value
export const accountSIDSchema = z
  .string()
  .regex(/^AC[0-9a-f]{32}$/iu, 'an account SID, such as AC followed by 32 hex digits');

export const apiKeySIDSchema = z
  .string()
  .regex(/^SK[0-9a-f]{32}$/iu, 'an API key SID, such as SK followed by 32 hex digits');

// The `twilio` section of the `phone` section: the account and the API key that the adapter signs
// in with. Each ID is the value or a reference to a settings entry.
export const twilioConfigSchema = z.strictObject({
  account_sid: z.union([accountSIDSchema, deploymentReference]),

  // the user of the API key's HTTP Basic sign-in
  api_key_sid: z.union([apiKeySIDSchema, deploymentReference]),

  // the entry that holds the API key's secret
  credential: deploymentReference,
  api_url: z.url({ protocol: /^https$/u }).default('https://api.twilio.com'),
});
