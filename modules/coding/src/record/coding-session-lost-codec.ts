import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// Written once by the sweep, on the thread of an ended coding task whose spawn started a session
// that nixie cannot find: the spawn's outcome no longer holds the session's ID.
export const codingSessionLostCodec = defineRecordCodec(
  'coding.session_lost',
  z.object({ taskID: z.string(), adapter: z.string(), actionID: z.string() }),
);
