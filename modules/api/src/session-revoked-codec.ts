import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// A device session revoked: the session's identity, and the identity of the session that revoked
// it.
export const sessionRevokedCodec = defineRecordCodec(
  'session.revoked',
  z.object({ identityID: z.string(), revokedBy: z.string() }),
);
