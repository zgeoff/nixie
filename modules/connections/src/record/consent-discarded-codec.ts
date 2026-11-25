import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import type { ConnectionRecordKind } from './connection-record-kind';

const kind = 'connection.consent_discarded' satisfies ConnectionRecordKind;

// A consent finished and nixie kept no token from it, and the one revocation attempt that followed.
export const consentDiscardedCodec = defineRecordCodec(
  kind,
  z.object({
    reason: z.enum(['account_mismatch', 'connection_forgotten', 'forget_in_progress']),
    revocation: z.enum(['confirmed', 'refused', 'unknown', 'not_attempted']),
  }),
);
