import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const deviceShownCodec = defineRecordCodec(
  'device.shown',
  z.object({ device: z.string(), until: z.number().int().nullable() }),
);
