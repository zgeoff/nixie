import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const refreshSavedCodec = defineRecordCodec(
  'credential.refresh_saved',
  z.object({
    credentialID: z.string(),
    attemptID: z.string(),
    fingerprint: z.string(),
  }),
);
