import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { modelFieldsShape } from './model-fields-shape';
import { summaryUsageSchema } from './summary-usage-schema';

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

    // A record from before the summary kept its calls' usage holds none.
    usage: summaryUsageSchema.exactOptional(),

    // The dollars of the tokens at the prices in force when the record was written, so a later
    // change of prices never reprices it. Absent for a profile with no prices.
    dollars: z.number().nonnegative().exactOptional(),
  }),
);
