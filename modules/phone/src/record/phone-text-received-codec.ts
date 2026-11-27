import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

const textReceivedSchema = z.object({
  textID: z.string(),
  shortID: z.string(),

  // the provider's message ID, which is unique
  messageID: z.string(),
  receivedAt: z.number(),
});

// One stored text that the assistant received, keyed by the provider's message ID. The sender and
// the body sit in the erasable fields.
export const phoneTextReceivedCodec = defineRecordCodec('phone.text_received', textReceivedSchema);
export const phoneTextFieldsSchema = z.object({ from: z.string(), body: z.string() });
