import { z } from 'zod';

// Where a grant was signed in: the issuer, and the endpoints that receive its refresh token.
export const grantBindingSchema = z.object({
  issuer: z.string(),
  tokenURL: z.string(),
  revokeURL: z.string().nullable(),
});
