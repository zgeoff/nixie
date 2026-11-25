import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// A start found a refresh that sent and never saved a result, so the provider may hold a token
// nixie never saved.
export const refreshLostCodec = defineRecordCodec(
  'credential.refresh_lost',
  z.object({
    credentialID: z.string(),
    attemptID: z.string(),
  }),
);
