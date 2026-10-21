import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const sessionRevokedCodec = defineRecordCodec(
  'session.revoked',
  z.object({ identityID: z.string(), revokedBy: z.string() }),
);
