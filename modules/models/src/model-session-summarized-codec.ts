import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { modelFieldsShape } from './model-fields-shape';

// the session's committed point that the summary call forked from
const boundarySchema = z.object({ sessionID: z.string(), messageID: z.string() });

// nixie's summary of a session: the last sequence the session held, the point it forked from, what
// asked for it, the context before it when the turn reported one, its size, and whether a second
// request cut it. Its text is erasable.
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
