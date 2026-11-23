import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const handoverAskedCodec = defineRecordCodec(
  'computer.handover_asked',
  z.object({ shortID: z.string() }),
);

// The erasable field: the reason the assistant gave for the ask
export const handoverAskedFieldsSchema = z.object({ reason: z.string() });
