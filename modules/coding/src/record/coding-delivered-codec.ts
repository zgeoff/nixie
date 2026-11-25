import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// Written by the step that reads a note's done outcome.
export const codingDeliveredCodec = defineRecordCodec(
  'coding.delivered',
  z.object({
    taskID: z.string(),

    // the ID of the task message the note carried, or of the coding.message call, or null for a
    // message of the user's
    messageID: z.string().nullable(),

    // the system's ID of the note
    messageRef: z.string(),

    // the task that sent the note, which gets the reply to its answer; null for the user
    from: z.string().nullable(),
    hop: z.int(),
  }),
);
