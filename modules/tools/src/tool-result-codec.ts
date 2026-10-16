import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// where each part of a result came from
const sourcesSchema = z.record(z.string(), z.enum(['owner', 'owner_data', 'untrusted']));

// A tool result's plain fields: the call's IDs, how the call settled, the action a queued call
// made, and the source of each part of the content, which is erasable.
export const toolResultCodec = defineRecordCodec(
  'tool_result',
  z.object({
    callID: z.string(),
    runID: z.string(),
    toolUseID: z.string().nullable(),
    outcome: z.enum(['result', 'invalid', 'denied', 'error', 'queued', 'failed', 'unknown']),
    actionID: z.string().nullable(),
    sources: sourcesSchema,
  }),
);
