import { z } from 'zod';

// nixie's secrets file once sops decrypts it: the deployment key, as base64 of 32 random bytes,
// impd's API token, and the model credentials and private settings, such as the owner's name and pronouns, that
// the configuration's deployment:<name> references name. It refuses an unknown key.
export const secretsSchema = z.strictObject({
  deployment_key: z.base64().refine((value) => Buffer.from(value, 'base64').byteLength === 32, {
    message: 'the deployment key is base64 of 32 bytes',
  }),
  impd_token: z.string().min(1),
  model_credentials: z.record(z.string(), z.string().min(1)).default({}),
  settings: z.record(z.string(), z.string().min(1)).default({}),
});
