import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// Written before nixie installs a secret in the broker, so a crash between the install and the
// sandbox's granted record still leaves the name that cleanup must remove.
export const sandboxGrantStartedCodec = defineRecordCodec(
  'sandbox.grant_started',
  z.object({
    secret: z.string(),
    host: z.string(),
    reference: z.string().exactOptional(),
    fingerprint: z.string().exactOptional(),
  }),
);
