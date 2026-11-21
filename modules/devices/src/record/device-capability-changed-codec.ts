import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const deviceCapabilityChangedCodec = defineRecordCodec(
  'device.capability_changed',
  z.object({
    device: z.string(),
    capability: z.enum(['screen', 'camera', 'speaker', 'microphone']),
    isOn: z.boolean(),
  }),
);
