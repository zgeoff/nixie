import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const replyVoidReasonSchema = z.enum([
  'attempt_failed',
  'attempt_lost',
  'turn_dropped',
  'silent',
]);

export type ReplyVoidReason = z.infer<typeof replyVoidReasonSchema>;

export const modelReplyVoidedCodec = defineRecordCodec(
  'model.reply_voided',
  z.object({
    replySequence: z.int(),
    runID: z.string(),
    reason: replyVoidReasonSchema,
  }),
);
