import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { modelFieldsShape } from './model-fields-shape';

export const modelCompactionFailedCodec = defineRecordCodec(
  'model.compaction_failed',
  z.object({
    ...modelFieldsShape,
    trigger: z.enum(['threshold', 'overflow']),
    failures: z.int().positive(),
    contextSize: z.int().nonnegative().exactOptional(),
  }),
);
