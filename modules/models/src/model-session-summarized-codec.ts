import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { modelFieldsShape } from './model-fields-shape';

const boundarySchema = z.object({ sessionID: z.string(), messageID: z.string() });

export const modelSessionSummarizedCodec = defineRecordCodec(
  'model.session_summarized',
  z.object({
    ...modelFieldsShape,
    throughSequence: z.int(),
    boundary: boundarySchema,
    trigger: z.enum(['threshold', 'overflow']),
    contextSize: z.int().nonnegative().exactOptional(),
    summaryTokens: z.int(),
    isCut: z.boolean(),
  }),
);
