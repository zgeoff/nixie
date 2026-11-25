import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const statusChangedCodec = defineRecordCodec(
  'credential.status_changed',
  z.object({
    credentialID: z.string(),
    status: z.enum(['active', 'failing', 'needs_consent']),
    reason: z.enum(['unauthorised', 'service_error', 'no_answer']).exactOptional(),
  }),
);
