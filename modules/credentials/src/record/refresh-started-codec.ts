import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// Written before a refresh sends, and naming the key the refresh's result will be sealed under, so
// a crash between the send and the save leaves the start the next start looks for.
export const refreshStartedCodec = defineRecordCodec(
  'credential.refresh_started',
  z.object({
    credentialID: z.string(),
    attemptID: z.string(),
    newKeyID: z.string(),
  }),
);
