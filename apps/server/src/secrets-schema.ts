import { z } from 'zod';

// nixie's secrets file once sops decrypts it: the deployment key that wraps every record key, as
// base64 of 32 random bytes, the token for impd's API, and one credential per model profile's
// deployment:<name> reference. It refuses an unknown key, as the configuration does.
export const secretsSchema = z.strictObject({
  deployment_key: z.base64().refine((value) => Buffer.from(value, 'base64').byteLength === 32, {
    message: 'the deployment key is base64 of 32 bytes',
  }),
  impd_token: z.string().min(1),
  model_credentials: z.record(z.string(), z.string().min(1)).default({}),
});
