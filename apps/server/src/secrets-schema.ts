import { z } from 'zod';

export const secretsSchema = z.strictObject({
  deployment_key: z.base64().refine((value) => Buffer.from(value, 'base64').byteLength === 32, {
    message: 'the deployment key is base64 of 32 bytes',
  }),
  impd_token: z.string().min(1).optional(),

  definitions_export_token: z.string().min(1).optional(),
  model_credentials: z.record(z.string(), z.string().min(1)).default({}),
  settings: z.record(z.string(), z.string().min(1)).default({}),
});
