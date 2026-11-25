import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { sessionStateSchema } from './session-state-schema';
import { wakeEventSchema } from './wake-event-schema';

// The session a coding task works with, written by the step that reads the spawn's outcome, by the
// join, or by the sweep for a spawn that finished after its task stopped.
export const codingSessionBoundCodec = defineRecordCodec(
  'coding.session_bound',
  z.object({
    taskID: z.string(),

    // the runner key
    adapter: z.string(),
    sessionID: z.string(),
    origin: z.enum(['started', 'joined']),

    // the spawn action; null for a join
    actionID: z.string().nullable(),

    // where the coding source's catch-up read starts
    fromCursor: z.string(),

    // the wake set the start or the join took
    wake: z.array(wakeEventSchema),

    // the session's state when the task bound it
    state: sessionStateSchema,

    // the hop the task's first message counts from
    hop: z.int(),
  }),
);
