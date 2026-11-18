import { z } from 'zod';

export const loginFileSchema = z.strictObject({
  version: z.literal(1),

  // random; each login writes a new one
  loginID: z.string().min(1),
  refreshToken: z.string().min(1),

  // the ChatGPT account ID, from the ID token
  accountID: z.string().min(1),

  // such as 'plus', from the ID token
  planType: z.string().min(1),
  email: z.string().min(1),
  status: z.enum(['active', 'failing', 'needs_login']),

  // null while active
  reason: z.enum(['refused', 'service_error', 'no_answer']).nullable(),
  statusSince: z.iso.datetime(),
  lastRefreshAt: z.iso.datetime().nullable(),
});

export type LoginFile = z.infer<typeof loginFileSchema>;
