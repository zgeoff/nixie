import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// A tool call's plain fields: its IDs, the tool, and the model and profile of the run that made it,
// which a call from before nixie recorded them lacks. Its input is erasable.
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
