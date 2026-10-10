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

const recordSchema = z.object({
  // The kind decides how a client renders the record, and a client shows an unfamiliar kind by
  // its name.
  kind: z.string(),

  // Set on a record that holds a message, from you or from the conversation.
  message: z
    .object({
      clientMessageID: z.uuid().optional(),
      spans: z.array(spanSchema).optional(),
      text: z.string(),
    })
    .optional(),
  recordedAt: z.date(),
  sequence: sequenceSchema,
  thread: threadSchema,
});

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

export const contract = {
  conversation: {
    // Returns one page of a thread, newest last, and the log sequence the page was read at, which
    // a client passes to log.follow so it misses no record and repeats none.
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
        }),
      ),

    // A checked action whose client action ID is the client message ID: the client keeps an
    // unsent message as pending and retries it with the same ID until the server confirms it.
    send: checkedAction
      .errors({ THREAD_NOT_FOUND: { message: 'No thread has this ID', status: 404 } })
      .input(
        z.object({
          clientMessageID: clientActionIDSchema,
          spans: z.array(spanSchema).max(100_000),
          text: z.string().min(1).max(100_000),
          thread: threadSchema,
        }),
      )
      .output(z.object({ duplicate: z.boolean(), sequence: sequenceSchema })),
  },
  log: {
    // The live stream. Each event's ID is its record's sequence, so a client that reconnects with
    // Last-Event-ID receives exactly the records it missed.
    follow: signedIn
      .input(z.object({ afterSequence: sequenceSchema, thread: threadSchema.optional() }))
      .output(eventIterator(z.object({ record: recordSchema }))),
  },
  sessions: {
    // Turns an enrolment code into a device session: an HttpOnly cookie for a browser, or a bearer
    // token in the output for the Android app. A retry with the same client action ID answers with
    // the same session and, for a bearer, a fresh token that replaces the first.
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
    // default.
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
