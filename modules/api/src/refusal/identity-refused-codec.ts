import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const identityRefusedCodec = defineRecordCodec(
  'identity.refused',
  z.object({ channel: z.string(), externalID: z.string(), refusedAt: z.number() }),
);
