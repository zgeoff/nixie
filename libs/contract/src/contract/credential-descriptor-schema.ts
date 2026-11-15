import { z } from 'zod';
import { base64URLSchema } from './base64-url-schema';
import { transportsSchema } from './transports-schema';

export const credentialDescriptorSchema = z.object({
  id: base64URLSchema,
  type: z.literal('public-key'),
  transports: transportsSchema.optional(),
});
