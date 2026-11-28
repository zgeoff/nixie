import { z } from 'zod';
import { defineRecordCodec } from '../utils/define-record-codec';
import { erasableKindSchema } from './erasable-kind';

export const erasureFinishedCodec = defineRecordCodec(
  'erasure.finished',
  z.object({
    erasureID: z.string(),
    kind: erasableKindSchema,
    targetID: z.string(),
    shortID: z.string().nullable(),
    by: z.enum(['user', 'assistant', 'system']),
    removedKeys: z.int().nonnegative(),
  }),
);
