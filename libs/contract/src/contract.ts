import { eventIterator, oc } from '@orpc/contract';
import { z } from 'zod';
import { imageLimits } from './image-limits';
import { imageNotFoundError } from './image-not-found-error';
import { imageRefusedError } from './image-refused-error';
import { memoryViewContract } from './memory-view-contract';
import { reusedIDErrors } from './reused-id-errors';
import { signedIn } from './signed-in';
import { spanSchema } from './span-schema';
import { taskSchema } from './task-schema';
import { toolCallSchema } from './tool-call-schema';

const clientActionIDSchema = z.uuid();
const sequenceSchema = z.int().nonnegative();
const threadSchema = z.string().min(1).max(200);
const imageSchema = z.object({ mediaType: z.enum(imageLimits.mediaTypes) });
const imageFilesSchema = z.array(z.file());

const imageRefSchema = z.object({
  position: z.int().nonnegative(),
  sequence: sequenceSchema,
  thread: threadSchema,
});

const versionRefSchema = z.object({
  itemID: z.string().min(1).max(200),
  version: z.int().nonnegative(),
});

const recallItemSchema = versionRefSchema.extend({ score: z.number().optional() });
const recallSchema = z.object({ items: z.array(recallItemSchema) });

const ratingItemSchema = versionRefSchema.extend({
  hasNote: z.boolean(),
  verdict: z.enum(['helpful', 'noise', 'misleading']),
});

const ratingSchema = z.object({
  items: z.array(ratingItemSchema),
  ratedBy: z.string().optional(),
  recalledSequence: sequenceSchema,
});

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

const ratingNoteRefSchema = z.object({
  itemID: z.string().min(1).max(200),
  sequence: sequenceSchema,
});

const ratingNoteSchema = ratingNoteRefSchema.extend({
  status: z.enum(['readable', 'shredded', 'unreadable', 'missing']),
  text: z.string().optional(),
});

const versionTextSchema = versionRefSchema.extend({
  status: z.enum(['readable', 'shredded', 'unreadable', 'missing']),
  text: z.string().optional(),
});

const recordSchema = z.object({
  compaction: compactionSchema.optional(),

  compactionFailure: compactionFailureSchema.optional(),

  forget: z.object({ sequence: sequenceSchema }).optional(),

  context: contextSchema.optional(),

  kind: z.string(),

  message: z
    .object({
      clientMessageId: z.uuid().optional(),

      images: z.array(imageSchema).optional(),
      spans: z.array(spanSchema).optional(),
      text: z.string(),
    })
    .optional(),

  rating: ratingSchema.optional(),

  recall: recallSchema.optional(),
  recordedAt: z.date(),
  sequence: sequenceSchema,

  summary: summarySchema.optional(),
  thread: threadSchema,

  task: taskSchema.optional(),

  toolCall: toolCallSchema.optional(),
});

const writerErrorSchema = z
  .object({ at: z.date(), code: z.string(), message: z.string().nullable() })
  .nullable();

const sessionSchema = z.object({
  createdAt: z.date(),
  current: z.boolean(),
  deviceName: z.string(),
  lastUsedAt: z.date(),
  sessionID: z.uuid(),
});

const checkedAction = signedIn.errors(reusedIDErrors);

const followRecords = signedIn
  .input(z.object({ afterSequence: sequenceSchema, thread: threadSchema.optional() }))
  .output(eventIterator(z.object({ record: recordSchema })));

export const contract = {
  conversation: {
    read: signedIn
      .errors({ THREAD_NOT_FOUND: { message: 'No thread has this ID', status: 404 } })
      .input(
        z.object({
          beforeSequence: sequenceSchema.optional(),
          limit: z.int().min(1).max(200).optional(),
          thread: threadSchema,
        }),
      )
      .output(
        z.object({
          hasEarlier: z.boolean(),
          readAtSequence: sequenceSchema,
          records: z.array(recordSchema),

          lastStepEnd: recordSchema.nullable().optional(),
        }),
      ),

    send: checkedAction
      .errors({
        IMAGE_REFUSED: imageRefusedError,
        THREAD_NOT_FOUND: { message: 'No thread has this ID', status: 404 },
      })
      .input(
        z.object({
          clientMessageId: clientActionIDSchema,

          images: imageFilesSchema.optional(),
          spans: z.array(spanSchema).max(100_000),
          text: z.string().min(1).max(100_000),
          thread: threadSchema,

          timeZone: z.string().min(1).max(100).optional(),

          writtenAt: z.iso.datetime().optional(),
        }),
      )
      .output(z.object({ duplicate: z.boolean(), sequence: sequenceSchema })),

    readImage: signedIn
      .errors({ IMAGE_NOT_FOUND: imageNotFoundError })
      .input(imageRefSchema)
      .output(z.file()),

    forget: checkedAction
      .errors({
        RECORD_NOT_FOUND: {
          message: 'No message or reply on this thread has this sequence',
          status: 404,
        },
      })
      .input(
        z.object({
          clientActionID: clientActionIDSchema,
          sequence: sequenceSchema,
          thread: threadSchema,
        }),
      )
      .output(z.object({ forgottenAt: z.date() })),
  },
  memory: {
    readVersions: signedIn
      .input(z.object({ versions: z.array(versionRefSchema).min(1).max(100) }))
      .output(z.object({ versions: z.array(versionTextSchema) })),

    readRatingNotes: signedIn
      .input(z.object({ notes: z.array(ratingNoteRefSchema).min(1).max(100) }))
      .output(z.object({ notes: z.array(ratingNoteSchema) })),

    writerStatus: signedIn.output(
      z.object({
        backlog: z.int().nonnegative(),
        batches: z.int().nonnegative(),
        cursor: sequenceSchema,
        failures: z.int().nonnegative(),
        isCatchingUp: z.boolean(),
        lastError: writerErrorSchema,
        retryAt: z.date().nullable(),
      }),
    ),
    ...memoryViewContract,
  },
  log: {
    // Clients of earlier releases call this path. A content blocker's generic rule for /rpc/log/
    // stops a browser from reaching it.
    follow: followRecords.route({ deprecated: true }),
  },
  records: {
    follow: followRecords,
  },
  sessions: {
    enrol: oc
      .errors(reusedIDErrors)
      .errors({
        ENROLMENT_CODE_INVALID: {
          message: 'The enrolment code is unknown, used or lapsed',
          status: 400,
        },
      })
      .input(
        z.object({
          clientActionID: clientActionIDSchema,
          code: z.string().min(1).max(100),
          deviceName: z.string().min(1).max(100),
          tokenDelivery: z.enum(['cookie', 'bearer']),
        }),
      )
      .output(z.object({ sessionID: z.uuid(), token: z.string().optional() })),

    issueCode: checkedAction
      .input(z.object({ clientActionID: clientActionIDSchema }))
      .output(z.object({ code: z.string(), expiresAt: z.date() })),
    list: signedIn.output(z.object({ sessions: z.array(sessionSchema) })),

    revoke: checkedAction
      .errors({ SESSION_NOT_FOUND: { message: 'No session has this ID', status: 404 } })
      .input(z.object({ clientActionID: clientActionIDSchema, sessionID: z.uuid() }))
      .output(z.object({ revokedAt: z.date() })),
  },
};
