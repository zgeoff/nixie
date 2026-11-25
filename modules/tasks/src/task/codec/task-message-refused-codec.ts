import { taskMessageKindSchema } from '@heynixie/contract';
import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

const refusalSchema = z.discriminatedUnion('reason', [
  z.object({ reason: z.literal('empty_body') }),
  z.object({ reason: z.literal('self') }),
  z.object({ reason: z.literal('unknown_task'), taskID: z.string() }),
  z.object({ reason: z.literal('finished'), taskID: z.string() }),
  z.object({ reason: z.literal('unknown_reply'), messageID: z.string() }),
  z.object({ reason: z.literal('not_owner_message'), eventIDs: z.string().array() }),
  z.object({ reason: z.literal('stale_step') }),
]);

// A message of a step's result that the task message write refused, on the sending task's thread.
// It keeps no body, so it holds no free text.
export const taskMessageRefusedCodec = defineRecordCodec(
  'task.message_refused',
  z.object({
    from: z.string(),
    to: z.string(),
    kind: taskMessageKindSchema,
    stepKey: z.string(),
    refusal: refusalSchema,
  }),
);
