import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

const sourcesSchema = z.record(z.string(), z.enum(['owner', 'owner_data', 'untrusted']));

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
