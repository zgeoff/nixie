import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const deviceIdleSetCodec = defineRecordCodec(
  'device.idle_set',
  z.object({ device: z.string() }),
);
