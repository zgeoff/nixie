import { z } from 'zod';
import { base64URLSchema } from './base64-url-schema';
import { credentialDescriptorSchema } from './credential-descriptor-schema';
import { userVerificationSchema } from './user-verification-schema';

export const requestOptionsSchema = z.object({
  challenge: base64URLSchema,
  rpId: z.string(),
  allowCredentials: z.array(credentialDescriptorSchema),
  userVerification: userVerificationSchema,
  timeout: z.int().positive(),
});
