import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// Written once the task lets go of its session.
export const codingSessionUnboundCodec = defineRecordCodec(
  'coding.session_unbound',
  z.object({
    taskID: z.string(),
    adapter: z.string(),
    sessionID: z.string(),
    cause: z.enum(['stopped', 'closed', 'failed']),
  }),
);
