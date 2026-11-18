import { z } from 'zod';

// the route ID of each plan route, with the login's state; the gateway sends no token and no email
export const chatgptLoginsSchema = z.record(
  z.string(),
  z.looseObject({
    status: z.enum(['active', 'failing', 'needs_login']),
    accountID: z.string().nullable(),
    planType: z.string().nullable(),
  }),
);
