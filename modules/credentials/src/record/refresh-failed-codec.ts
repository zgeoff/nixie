import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// The refresh got an answer, or none, and no token came out of it.
export const refreshFailedCodec = defineRecordCodec(
  'credential.refresh_failed',
  z.object({
    credentialID: z.string(),
    attemptID: z.string(),
    outcome: z.enum(['refused', 'service_error', 'no_answer']),
  }),
);
