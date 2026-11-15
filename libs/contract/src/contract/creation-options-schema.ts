import { z } from 'zod';
import { base64URLSchema } from './base64-url-schema';
import { credentialDescriptorSchema } from './credential-descriptor-schema';
import { userVerificationSchema } from './user-verification-schema';

const userSchema = z.object({ id: base64URLSchema, name: z.string(), displayName: z.string() });
const parameterSchema = z.object({ type: z.literal('public-key'), alg: z.int() });

const selectionSchema = z.object({
  residentKey: userVerificationSchema,
  requireResidentKey: z.boolean(),
  userVerification: userVerificationSchema,
});

export const creationOptionsSchema = z.object({
  rp: z.object({ id: z.string(), name: z.string() }),
  user: userSchema,
  challenge: base64URLSchema,
  pubKeyCredParams: z.array(parameterSchema),
  timeout: z.int().positive(),
  excludeCredentials: z.array(credentialDescriptorSchema),
  authenticatorSelection: selectionSchema,
  attestation: z.enum(['none', 'indirect', 'direct', 'enterprise']),
});
