import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const deviceLayoutRemovedCodec = defineRecordCodec(
  'device.layout_removed',
  z.object({ device: z.string(), name: z.string() }),
);
