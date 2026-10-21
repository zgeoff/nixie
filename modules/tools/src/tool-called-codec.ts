import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const toolCalledCodec = defineRecordCodec(
  'tool_called',
  z.object({
    callID: z.string(),
    runID: z.string(),
    toolUseID: z.string().nullable(),
    tool: z.string(),
    model: z.string().exactOptional(),
    profile: z.string().exactOptional(),
  }),
);
