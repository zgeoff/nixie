import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

const mailSentSchema = z.object({
  messageID: z.string(),
  shortID: z.string(),
  threadShortID: z.string(),
  hostMessageID: z.string(),
  actionID: z.string(),
  sentAt: z.number(),
  headerHash: z.string(),
  referenceHashes: z.array(z.string()),
  replyRuleShortID: z.string().nullable(),
});

// One mail that the assistant sent, written by the outcome of its send. The recipients, the subject
// and the text sit in the erasable fields.
export const mailSentCodec = defineRecordCodec('mail.sent', mailSentSchema);

export const mailSentFieldsSchema = z.object({
  to: z.array(z.string()),
  subject: z.string(),
  text: z.string(),
  messageIDHeader: z.string(),
  references: z.array(z.string()),
});
