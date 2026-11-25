import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

const hashListSchema = z.array(z.string());

const mailReceivedSchema = z.object({
  messageID: z.string(),
  shortID: z.string(),
  threadShortID: z.string(),
  hostMessageID: z.string(),
  receivedAt: z.number(),

  // the hash of the Message-ID header, and of each ID it answers, so a thread joins with no text
  headerHash: z.string(),
  referenceHashes: hashListSchema,
});

// One stored mail that the assistant received. Its sender, recipients, subject, text and attachment
// names sit in the erasable fields.
export const mailReceivedCodec = defineRecordCodec('mail.received', mailReceivedSchema);
const attachmentSchema = z.object({ name: z.string(), bytes: z.int() });

export const mailReceivedFieldsSchema = z.object({
  from: z.string(),
  to: z.array(z.string()),
  cc: z.array(z.string()),
  subject: z.string(),
  text: z.string(),
  attachments: z.array(attachmentSchema),

  // the Message-ID header, empty when the mail has none, and the IDs it answers: a reply needs them
  messageIDHeader: z.string(),
  references: z.array(z.string()),
});
