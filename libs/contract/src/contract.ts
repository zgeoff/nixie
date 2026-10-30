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

const routeSchema = z.object({
  isMove: z.boolean(),
  messages: z.array(sequenceSchema),
  taskID: threadSchema,
});

const listedActionSchema = z.object({ actionID: z.string(), tool: z.string() });

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

const recordSchema = z.object({
  compaction: compactionSchema.optional(),

  exchangeNotice: exchangeNoticeSchema.optional(),

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

  moment: z
    .object({ momentID: z.string(), shortID: z.string(), title: z.string().optional() })
    .optional(),

  rating: ratingSchema.optional(),

  recall: recallSchema.optional(),
  recordedAt: z.date(),

  route: routeSchema.optional(),
  sequence: sequenceSchema,

  stop: z.object({ cancelledActions: z.array(listedActionSchema) }).optional(),

  summary: summarySchema.optional(),
  thread: threadSchema,

  task: taskSchema.optional(),

  taskMessage: taskMessageSchema.optional(),

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
const taskNameSchema = z.string().trim().min(1).max(80);
const taskBriefSchema = z.string().trim().min(1).max(8000);

const newTaskTargetSchema = z.object({
  kind: z.literal('new'),
  name: taskNameSchema,
  brief: taskBriefSchema,
});

const moveTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('task'), taskID: threadSchema }),
  newTaskTargetSchema,
]);

const taskStateSchema = z.enum([
  'ready',
  'running',
  'waiting',
  'paused',
  'stopped',
  'done',
  'failed',
  'closed',
]);

const taskControlSchema = z.enum(['pause', 'resume', 'stop', 'restart', 'close', 'interrupt']);
const actionCountSchema = z.int().nonnegative();

const listedTaskSchema = z.object({
  actions: z.object({
    cancelled: actionCountSchema,
    queued: actionCountSchema,
    started: actionCountSchema,
  }),
  brief: z.string(),
  controls: z.array(taskControlSchema),
  isPauseRequested: z.boolean(),
  isTakingMessages: z.boolean(),
  lastActivityAt: z.date(),
  name: z.string(),
  state: taskStateSchema,
  taskID: threadSchema,
  waitingOn: threadSchema.optional(),
});

const controlledTaskSchema = z.object({
  controlledAt: z.date(),
  isPauseRequested: z.boolean(),
  state: taskStateSchema,
  taskID: threadSchema,
});

const taskControl = checkedAction
  .errors({
    TASK_NOT_FOUND: { message: 'No task has this ID', status: 404 },
    TASK_STATE_REFUSED: {
      message: 'The task is in a state that does not take this control',
      status: 409,
      data: z.object({ isPauseRequested: z.boolean(), state: taskStateSchema }),
    },
  })
  .input(z.object({ clientActionID: clientActionIDSchema, taskID: threadSchema }))
  .output(controlledTaskSchema);

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

    move: checkedAction
      .errors({
        RECORD_NOT_FOUND: {
          message: 'No message of yours on this thread has this sequence',
          status: 404,
        },
        TASK_NOT_FOUND: { message: 'No open task has this ID', status: 404 },
        TASK_TAKES_NO_MESSAGES: {
          message: 'This task runs on its own schedule and takes no message of yours',
          status: 409,
        },
        ALREADY_THERE: { message: 'The message already went to this task', status: 409 },
      })
      .input(
        z.object({
          clientActionID: clientActionIDSchema,
          sequence: sequenceSchema,
          thread: threadSchema,
          to: moveTargetSchema,
        }),
      )
      .output(z.object({ movedAt: z.date(), taskID: threadSchema })),
  },
  tasks: {
    list: signedIn.output(
      z.object({ readAtSequence: sequenceSchema, tasks: z.array(listedTaskSchema) }),
    ),
    read: signedIn
      .errors({ TASK_NOT_FOUND: { message: 'No task has this ID', status: 404 } })
      .input(z.object({ taskID: threadSchema }))
      .output(listedTaskSchema),
    readActions: signedIn
      .errors({ TASK_NOT_FOUND: { message: 'No task has this ID', status: 404 } })
      .input(z.object({ taskID: threadSchema }))
      .output(
        z.object({
          queued: z.array(listedActionSchema),
          started: z.array(listedActionSchema),
        }),
      ),
    pause: taskControl,
    resume: taskControl,
    stop: taskControl,
    restart: taskControl,
    close: taskControl.errors({
      CONVERSATION_NEVER_CLOSES: { message: 'The conversation is never closed', status: 409 },
    }),
    interrupt: taskControl,
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
        isEnabled: z.boolean(),
        backlog: z.int().nonnegative(),
        batches: z.int().nonnegative(),
        cursor: sequenceSchema,
        failures: z.int().nonnegative(),
        isCatchingUp: z.boolean(),
        lastError: writerErrorSchema,
        retryAt: z.date().nullable(),
      }),
    ),

    consolidatorStatus: signedIn.output(z.object({ isEnabled: z.boolean() })),
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
