import { eventIterator, oc } from '@orpc/contract';
import { z } from 'zod';

// The contract is add-only once released: a later release adds procedures, optional input fields,
// output fields and enum members, and never removes or renames one. The server validates every
// input and output against it, and a client imports it as types.

// A client creates the ID once per action and sends it again on every retry, so the server applies
// the action once and answers a retry with the first result.
const clientActionIDSchema = z.uuid();

const sequenceSchema = z.int().nonnegative();

const threadSchema = z.string().min(1).max(200);

// Offsets count UTF-16 code units, as JavaScript string indices do. The server labels the whole
// message unknown when its spans are out of order, overlap or leave a gap.
const spanSchema = z.object({
  end: z.int().nonnegative(),
  source: z.enum(['typed', 'pasted', 'dropped', 'unknown']),
  start: z.int().nonnegative(),
});

const jsonObjectSchema = z.record(z.string(), z.unknown());

// A failed step's record carries the error its step threw, while the record is readable, the
// errors in a row with this one, the limit in force, and when the task tries again. The
// conversation never fails, so its errors can pass the limit, and a client shows that it is failing.
const taskSchema = z.object({
  error: z.string().optional(),
  errorLimit: z.int().positive().optional(),
  errors: z.int().positive().optional(),
  retryAt: z.date().optional(),
  stepKey: z.string().optional(),
  taskID: z.string(),
});

const toolCallSchema = z.object({
  callID: z.string(),
  content: jsonObjectSchema.optional(),
  input: jsonObjectSchema.optional(),
  outcome: z.string().optional(),
  tool: z.string().optional(),
});

const versionRefSchema = z.object({
  itemID: z.string().min(1).max(200),
  version: z.int().nonnegative(),
});

// A recall's delivered versions, each with its match score when a query ranked it. The record
// holds references and scores, never text; memory.readVersions reads the text.
const recallItemSchema = versionRefSchema.extend({ score: z.number().optional() });

const recallSchema = z.object({ items: z.array(recallItemSchema) });

// A version's text while its key exists. A forgotten item's version reads as shredded.
const versionTextSchema = versionRefSchema.extend({
  status: z.enum(['readable', 'shredded', 'unreadable', 'missing']),
  text: z.string().optional(),
});

const recordSchema = z.object({
  // The kind decides how a client renders the record, and a client shows an unfamiliar kind by
  // its name.
  kind: z.string(),

  // Set on a record that holds a message, from you or from the conversation.
  message: z
    .object({
      clientMessageId: z.uuid().optional(),
      spans: z.array(spanSchema).optional(),
      text: z.string(),
    })
    .optional(),

  // Set on a memory.recalled record: the memory versions the recall delivered.
  recall: recallSchema.optional(),
  recordedAt: z.date(),
  sequence: sequenceSchema,
  thread: threadSchema,

  // Set on a task record: the task it belongs to, and the step for a step record.
  task: taskSchema.optional(),

  // Set on a tool call's record and its result's record, which share the call ID. The call
  // carries the tool and its input, and the result its outcome and content, while they are
  // readable.
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

// Every procedure except enrol needs a device session, from the cookie or a bearer token.
const signedIn = oc.errors({
  UNAUTHORIZED: { message: 'The device session is missing, lapsed or revoked', status: 401 },
});

// Every checked action refuses a client action ID that arrived before with a different input.
const reusedIDErrors = {
  CLIENT_ACTION_ID_REUSED: {
    message: 'The client action ID belongs to a different action',
    status: 409,
  },
};

const checkedAction = signedIn.errors(reusedIDErrors);

const followRecords = signedIn
  .input(z.object({ afterSequence: sequenceSchema, thread: threadSchema.optional() }))
  .output(eventIterator(z.object({ record: recordSchema })));

export const contract = {
  conversation: {
    // Returns one page of a thread, newest last, and the log sequence the page was read at, which
    // a client passes to records.follow so it misses no record and repeats none.
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

          // The newest record on the thread that ended a step of its task, at or before
          // readAtSequence, whether or not the page holds it, so a client knows how the last step
          // ended when a long step pushes that record off the page.
          lastStepEnd: recordSchema.nullable().optional(),
        }),
      ),

    // A checked action whose client action ID is `clientMessageId`, the name the client design
    // gives it. The client retries an unsent message with the same ID until the server confirms it.
    send: checkedAction
      .errors({ THREAD_NOT_FOUND: { message: 'No thread has this ID', status: 404 } })
      .input(
        z.object({
          clientMessageId: clientActionIDSchema,
          spans: z.array(spanSchema).max(100_000),
          text: z.string().min(1).max(100_000),
          thread: threadSchema,

          // The sending device's IANA time zone, such as Europe/London. The server stores a zone
          // it knows with the message and drops one it does not, and the message still sends.
          timeZone: z.string().min(1).max(100).optional(),
        }),
      )
      .output(z.object({ duplicate: z.boolean(), sequence: sequenceSchema })),
  },
  memory: {
    // Reads the text of named memory versions, such as those a recall delivered, in the order
    // named. A forgotten item's version reads as shredded and carries no text.
    readVersions: signedIn
      .input(z.object({ versions: z.array(versionRefSchema).min(1).max(100) }))
      .output(z.object({ versions: z.array(versionTextSchema) })),

    // The memory writer's progress: its cursor over the event log, how many of your messages wait
    // for it, whether its catch-up over the log from before memory is still running, and its last
    // error with when it tries again. The writer never stops on an error; it backs off.
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
  },
  log: {
    // The live stream under its first name, kept for the clients of earlier releases. A content
    // blocker's generic rule for /rpc/log/ stops a browser from calling it, so the web client
    // calls records.follow, and a later release may remove this one.
    follow: followRecords.route({ deprecated: true }),
  },
  records: {
    // The live stream. Each event's ID is its record's sequence, so a client that reconnects with
    // Last-Event-ID receives exactly the records it missed.
    follow: followRecords,
  },
  sessions: {
    // Turns an enrolment code into a device session: an HttpOnly cookie for a browser, or a bearer
    // token in the output for the Android app. A retry with the same client action ID answers with
    // the same session and a fresh token, in the cookie or the output, that replaces the first.
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

    // Issues a code that enrols one more device. It works once and lapses unused after 15 min by
    // default. A retry answers with a fresh code that replaces the first, with the same lapse time.
    issueCode: checkedAction
      .input(z.object({ clientActionID: clientActionIDSchema }))
      .output(z.object({ code: z.string(), expiresAt: z.date() })),
    list: signedIn.output(z.object({ sessions: z.array(sessionSchema) })),

    // Revoking a session that is already revoked succeeds and changes nothing.
    revoke: checkedAction
      .errors({ SESSION_NOT_FOUND: { message: 'No session has this ID', status: 404 } })
      .input(z.object({ clientActionID: clientActionIDSchema, sessionID: z.uuid() }))
      .output(z.object({ revokedAt: z.date() })),
  },
};
