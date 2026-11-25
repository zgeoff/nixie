import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// A removal moved the counter while the refresh was in flight, so it saved nothing.
export const refreshDiscardedCodec = defineRecordCodec(
  'credential.refresh_discarded',
  z.object({
    credentialID: z.string(),
    attemptID: z.string(),
    isRevoked: z.boolean(),
  }),
);
