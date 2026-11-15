import { z } from 'zod';
import { base64URLSchema } from './base64-url-schema';
import { transportsSchema } from './transports-schema';

const attestationSchema = z.object({
  clientDataJSON: base64URLSchema,
  attestationObject: base64URLSchema,
  authenticatorData: base64URLSchema.optional(),
  transports: transportsSchema.optional(),
  publicKeyAlgorithm: z.int().optional(),
  publicKey: base64URLSchema.optional(),
});

export const registrationResponseSchema = z.object({
  id: base64URLSchema,
  rawId: base64URLSchema,
  response: attestationSchema,
  authenticatorAttachment: z.enum(['cross-platform', 'platform']).optional(),
  clientExtensionResults: z.object({}),
  type: z.literal('public-key'),
});
