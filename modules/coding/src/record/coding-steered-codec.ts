import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// Written by the step that reads a steer's done outcome.
export const codingSteeredCodec = defineRecordCodec(
  'coding.steered',
  z.object({
    taskID: z.string(),
    actionID: z.string(),

    // the hop of the turn that called coding.steer
    hop: z.int(),
  }),
);
