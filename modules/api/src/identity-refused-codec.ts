import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// An event that resolved to nobody: its channel, its external ID and when it was refused, and none
// of its content.
export const identityRefusedCodec = defineRecordCodec(
  'identity.refused',
  z.object({ channel: z.string(), externalID: z.string(), refusedAt: z.number() }),
);
