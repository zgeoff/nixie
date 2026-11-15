import { z } from 'zod';
import { base64URLSchema } from './base64-url-schema';

// The JSON shape of the WebAuthn browser API, which the contract holds as its own schema so that
// the published package depends on no WebAuthn library.
const assertionSchema = z.object({
  clientDataJSON: base64URLSchema,
  authenticatorData: base64URLSchema,
  signature: base64URLSchema,
  userHandle: base64URLSchema.optional(),
});

export const authenticationResponseSchema = z.object({
  id: base64URLSchema,
  rawId: base64URLSchema,
  response: assertionSchema,
  authenticatorAttachment: z.enum(['cross-platform', 'platform']).optional(),

  // the server reads no client extension result, so a schema keeps none
  clientExtensionResults: z.object({}),
  type: z.literal('public-key'),
});
