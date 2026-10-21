import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { modelFieldsShape } from './model-fields-shape';

const statusSchema = z.record(z.string(), z.union([z.string(), z.number()]));

export const modelSessionOpenedCodec = defineRecordCodec(
  'model.session_opened',
  z.object({
    ...modelFieldsShape,
    kind: z.enum(['first', 'compaction', 'rebuild']),
    reason: z.enum(['lost', 'forget', 'persona', 'images']).nullable(),
    lostSessionID: z.string().nullable(),
    summarySequence: z.int().nullable(),
    recentRecords: z.int(),
    heldFrom: z.int().nonnegative().exactOptional(),
    recentEvents: z.int(),
    recalledThrough: z.int().nonnegative(),
    status: statusSchema,
    personaHash: z.string(),
    policyHash: z.string(),
  }),
);
