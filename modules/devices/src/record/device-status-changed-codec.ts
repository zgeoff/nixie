import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { deviceWakeChangeSchema } from './device-watch-set-codec';

export const deviceStatusChangedCodec = defineRecordCodec(
  'device.status_changed',
  z.object({
    device: z.string(),
    name: z.string(),
    status: deviceWakeChangeSchema,
    at: z.number(),
  }),
);
