import { z } from 'zod';
import { defineRecordCodec } from '../utils/define-record-codec';
import { erasableKindSchema } from './erasable-kind';
import { erasureCaptureSchema } from './erasure-capture-schema';

// Both erasure records hold IDs and sequences only and are written in clear.
export const erasureStartedCodec = defineRecordCodec(
  'erasure.started',
  z.object({
    erasureID: z.string(),
    kind: erasableKindSchema,
    targetID: z.string(),
    shortID: z.string().nullable(),
    version: z.int().positive().nullable(),
    parentID: z.string().nullable(),
    by: z.enum(['user', 'assistant', 'system']),
    capture: erasureCaptureSchema,
    keyCount: z.int().nonnegative(),
  }),
);
