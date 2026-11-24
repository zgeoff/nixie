import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const deviceWakeChangeSchema = z.enum(['online', 'offline']);

export const deviceWatchSetCodec = defineRecordCodec(
  'device.watch_set',
  z.object({ device: z.string(), wake: z.array(deviceWakeChangeSchema) }),
);
