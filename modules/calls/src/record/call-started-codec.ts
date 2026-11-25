import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// Opens a call on the conversation's thread. `callID` is the call's short ID, which the model
// reads; the call's task holds the call's own thread.
export const callStartedCodec = defineRecordCodec(
  'call.started',
  z.object({
    callID: z.string(),
    taskID: z.string(),
    startedBy: z.enum(['you', 'nixie']),

    // the identity ID of the device session that holds the call's audio
    carryingSession: z.string(),
  }),
);
