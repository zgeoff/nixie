import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// A tool of an outside source changed and its change applied with no allow. The note sits in the
// inbox of the conversation, which reads it with its next turn and wakes nothing.
export const toolChangedCodec = defineRecordCodec(
  'tool_changed',
  z.object({
    tool: z.string(),
    fromHash: z.string().nullable(),
    toHash: z.string().nullable(),
  }),
);
