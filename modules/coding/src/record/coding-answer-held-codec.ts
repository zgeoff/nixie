import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// An answer that reached the inbox before the outcome of its note's action. The answer itself stays
// in the erasable fields of the trigger.task_input record at `sequence`, so a forget of that record
// erases it.
export const codingAnswerHeldCodec = defineRecordCodec(
  'coding.answer_held',
  z.object({ taskID: z.string(), messageRef: z.string(), sequence: z.int() }),
);
