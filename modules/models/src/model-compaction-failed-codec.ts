import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { modelFieldsShape } from './model-fields-shape';

// A compaction that failed in place of a summary: what asked for it, the failures in a row, and the
// context before it when the turn reported one. Its error is erasable.
export const modelCompactionFailedCodec = defineRecordCodec(
  'model.compaction_failed',
  z.object({
    ...modelFieldsShape,
    trigger: z.enum(['threshold', 'overflow']),
    failures: z.int().positive(),
    contextSize: z.int().nonnegative().exactOptional(),
  }),
);
