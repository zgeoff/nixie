import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

const matchSchema = z.strictObject({
  from: z.array(z.string()).exactOptional(),
  subject: z.string().exactOptional(),
  thread: z.string().exactOptional(),
});

const ruleSchema = z.object({
  ruleID: z.string(),
  shortID: z.string(),
  match: matchSchema,
  expiresAt: z.number().nullable(),
});

// `arrived` is the sequence of the mail's arrival record, and `mailbox` is the mailbox's key, so a
// forget of one mailbox finds the wakes that show its mail
const mailSchema = z.object({
  arrived: z.int(),
  mailbox: z.string(),
  messageID: z.string(),
  threadID: z.string(),
  receivedAt: z.number(),
});

const mailWokeSchema = z.object({
  taskID: z.string(),
  rules: z.array(ruleSchema),

  // oldest first
  mails: z.array(mailSchema),
});

// One wake of a target by the mail that its wake rules matched, on the target's thread. It carries
// what its render needs, so the render reads no other record. The sender and the subject of each
// mail sit in the record's erasable fields, so a forget destroys them.
export const triggerMailWokeCodec = defineRecordCodec('trigger.mail_woke', mailWokeSchema);
const erasableMailSchema = z.object({ arrived: z.int(), from: z.string(), subject: z.string() });

// The erasable part of a wake: one entry per mail, in the order of the payload's mails.
export const mailWokeFieldsSchema = z.object({ mails: z.array(erasableMailSchema) });
