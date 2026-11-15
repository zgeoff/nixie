import { oc } from '@orpc/contract';
import { z } from 'zod';

const hostPasskeySchema = z.object({
  passkeyID: z.string(),
  label: z.string(),
  synced: z.boolean(),
  origin: z.string(),
  registeredBy: z.string(),
  authorizedBy: z.string(),
  registeredAt: z.date(),
  lastUsedAt: z.date().nullable(),
  revokedAt: z.date().nullable(),
});

export const hostPasskeyContract = {
  issueCode: oc.output(z.object({ code: z.string(), expiresAt: z.date() })),
  list: oc.output(z.array(hostPasskeySchema)),

  revoke: oc
    .errors({
      PASSKEY_NOT_FOUND: { message: 'no passkey has that ID', status: 404 },
    })
    .input(z.strictObject({ passkeyID: z.string().min(1) }))
    .output(z.object({ passkeyID: z.string(), revokedAt: z.date() })),
};
