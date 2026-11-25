import { z } from 'zod';
import { spanSchema } from '../span/span-schema';
import { clippedPayloadSchema } from './clipped-payload-schema';
import { definitionNoticeSchema } from './definition-notice-schema';
import { imageLimits } from './image-limits';
import { sequenceSchema } from './sequence-schema';
import { taskSchema } from './task-schema';
import { threadSchema } from './thread-schema';
import { toolCallSchema } from './tool-call-schema';
import { workerViewSchema } from './worker-view-schema';

const imageSchema = z.object({ mediaType: z.enum(imageLimits.mediaTypes) });

export const versionRefSchema = z.object({
  itemID: z.string().min(1).max(200),
  version: z.int().nonnegative(),
});

const recallItemSchema = versionRefSchema.extend({ score: z.number().optional() });
const recallSchema = z.object({ items: z.array(recallItemSchema) });
const replyVoidReasonSchema = z.enum(['attempt_failed', 'attempt_lost', 'turn_dropped', 'silent']);
const tokenCountSchema = z.int().nonnegative();
const contextSchema = z.object({ size: tokenCountSchema, window: z.int().positive() });

const compactionSchema = z.object({
  postTokens: tokenCountSchema.optional(),
  preTokens: tokenCountSchema,
  trigger: z.enum(['manual', 'auto']),
});

const summarySchema = z.object({
  contextSize: tokenCountSchema.optional(),
  summaryTokens: tokenCountSchema,
  text: z.string().optional(),
  trigger: z.enum(['threshold', 'overflow']),
});

const compactionFailureSchema = z.object({ failures: z.int().positive() });

export const versionTextSchema = versionRefSchema.extend({
  status: z.enum(['readable', 'shredded', 'unreadable', 'missing']),
  text: z.string().optional(),
});

export const listedActionSchema = z.object({ actionID: z.string(), tool: z.string() });

const taskMessageSchema = z.object({
  from: threadSchema,
  fromName: z.string(),
  hop: z.int().nonnegative(),
  kind: z.string(),
  messageID: z.string(),
  replyTo: z.string().optional(),
  text: z.string().optional(),
  to: threadSchema,
  woke: z.boolean(),
});

const exchangeNoticeSchema = z.object({
  link: z.object({ label: z.string(), messageID: z.string(), taskID: threadSchema }),
  text: z.string(),
});

const reminderSchema = z.object({
  // null when the version that holds the name is no longer stored
  name: z.string().nullable(),
  note: z.string(),
  scheduledFor: z.iso.datetime({ offset: true }),
  lateBySeconds: z.number().nullable(),
});

export const recordSchema = z.object({
  clipped: z.array(clippedPayloadSchema).optional(),
  compaction: compactionSchema.optional(),

  exchangeNotice: exchangeNoticeSchema.optional(),

  reminder: reminderSchema.optional(),

  compactionFailure: compactionFailureSchema.optional(),

  forget: z.object({ sequence: sequenceSchema }).optional(),

  context: contextSchema.optional(),

  definitionNotice: definitionNoticeSchema.optional(),

  // set on an assistant's ask for a take-over, with the reason while it is readable
  handover: z.object({ reason: z.string().optional() }).optional(),

  isRemoved: z.literal(true).optional(),

  isSilentTurn: z.literal(true).optional(),

  kind: z.string(),

  message: z
    .object({
      clientMessageId: z.uuid().optional(),

      images: z.array(imageSchema).optional(),

      // set on a model reply that a void record names, with the reason it names
      isVoided: z.literal(true).optional(),
      spans: z.array(spanSchema).optional(),
      text: z.string(),
      voidReason: replyVoidReasonSchema.optional(),
    })
    .optional(),

  moment: z
    .object({ momentID: z.string(), shortID: z.string(), title: z.string().optional() })
    .optional(),

  proposal: z.object({ proposalID: z.string(), shortID: z.string() }).optional(),

  recall: recallSchema.optional(),
  recordedAt: z.date(),

  // set on the outcome of an action that removed a record for good, which names the record and the
  // call that asked for it
  removal: z
    .object({ kind: z.string(), sequence: sequenceSchema, callSequence: sequenceSchema.optional() })
    .optional(),

  sequence: sequenceSchema,

  // set on a skill that an allow rule applied at once, with the version it put in force
  skillNotice: z
    .object({ name: z.string(), skillHash: z.string(), isNew: z.boolean(), ruleID: z.string() })
    .optional(),

  stop: z.object({ cancelledActions: z.array(listedActionSchema) }).optional(),

  summary: summarySchema.optional(),
  thread: threadSchema,

  task: taskSchema.optional(),

  taskMessage: taskMessageSchema.optional(),

  toolCall: toolCallSchema.optional(),

  // set on a void record, which names the reply it voids and the reason
  voidedReply: z.object({ sequence: sequenceSchema, reason: replyVoidReasonSchema }).optional(),
  worker: workerViewSchema.optional(),
});
