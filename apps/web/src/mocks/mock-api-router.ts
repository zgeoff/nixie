// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { renderSessionCookie } from '@heynixie/contract';
import { withEventMeta } from '@orpc/server';
import type { ReadonlyDeep } from '../types';
import { mockImplementer } from './mock-implementer';
import { mockMemoryProcedures } from './mock-memory-procedures';
import { requireMockSession } from './require-mock-session';
import { store } from './store';
import { toLogRecord } from './to-log-record';
import { writeMockForget } from './write-mock-forget';

// The contract's implementer, under the short name oRPC's examples give it.
const os = mockImplementer;

// The live stream, under its current name and the deprecated one the contract keeps. As the API
// does, it checks the session before it returns the stream.
const followProcedure = os.records.follow.handler((options) => {
  requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

  return toRecordEvents({ ...options.input, signal: options.signal });
});

// A stand-in for nixie's API that implements the contract over the mock store, so the client's
// real link, serialisation and typed errors run in every test.
export const mockAPIRouter = os.router({
  conversation: {
    read: os.conversation.read.handler((options) => {
      requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

      const limit = options.input.limit ?? 50;
      const before = options.input.beforeSequence ?? Number.POSITIVE_INFINITY;

      const page = store.records.findMany(
        (query) =>
          query.where(
            (record) => record.thread === options.input.thread && record.sequence < before,
          ),
        { orderBy: { sequence: 'asc' } },
      );

      const lastStepEnd = page.findLast((record) =>
        /^task\.(?:step_committed|step_errored|revived)$/u.test(record.kind),
      );

      return {
        hasEarlier: page.length > limit,
        readAtSequence: Math.max(0, ...store.records.all().map((record) => record.sequence)),
        records: page.slice(-limit).map((record) => toLogRecord(record)),
        lastStepEnd: lastStepEnd === undefined ? null : toLogRecord(lastStepEnd),
      };
    }),

    send: os.conversation.send.handler(async (options) => {
      requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

      const input = options.input;

      const earlier = store.records.findFirst((query) =>
        query.where((record) => record.message?.clientMessageId === input.clientMessageId),
      );

      if (earlier === undefined) {
        const images = await Promise.all((input.images ?? []).map((image) => toStoredImage(image)));

        const record = await store.records.create({
          kind: 'owner_message',
          message: {
            clientMessageId: input.clientMessageId,
            spans: input.spans,
            text: input.text,
            ...(images.length === 0 ? {} : { images }),
          },
          thread: input.thread,
        });

        return { duplicate: false, sequence: record.sequence };
      }

      if (earlier.message?.text !== input.text || earlier.thread !== input.thread) {
        throw options.errors.CLIENT_ACTION_ID_REUSED();
      }

      return { duplicate: true, sequence: earlier.sequence };
    }),

    // an image of a message the store holds, which a forget removes with the message's text
    readImage: os.conversation.readImage.handler((options) => {
      requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

      const record = store.records.findFirst((query) =>
        query.where(
          (stored) =>
            stored.sequence === options.input.sequence && stored.thread === options.input.thread,
        ),
      );

      const image = record?.message?.images?.[options.input.position];

      if (image === undefined) {
        throw options.errors.IMAGE_NOT_FOUND();
      }

      return new File([Uint8Array.fromBase64(image.data)], `image-${options.input.position + 1}`, {
        type: image.mediaType,
      });
    }),

    // forgets your message or a reply as the API's forget leaves the log
    forget: os.conversation.forget.handler(async (options) => {
      requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

      const result = await writeMockForget(options.input);

      if (result.status !== 'forgotten') {
        throw {
          not_found: options.errors.RECORD_NOT_FOUND,
          reused: options.errors.CLIENT_ACTION_ID_REUSED,
        }[result.status]();
      }

      return { forgottenAt: result.forgottenAt };
    }),
  },
  log: { follow: followProcedure },
  memory: mockMemoryProcedures,
  records: { follow: followProcedure },
  sessions: {
    enrol: os.sessions.enrol.handler(async (options) => {
      const input = options.input;
      const code = findUsableCode(input.code, input.clientActionID);

      if (code === undefined) {
        throw options.errors.ENROLMENT_CODE_INVALID();
      }

      const session = await claimEnrolmentCode({ ...input, sessionID: code.sessionID });

      if (input.tokenDelivery === 'bearer') {
        return { sessionID: session.sessionID, token: session.token };
      }

      options.context.resHeaders?.append('set-cookie', renderSessionCookie(session.token));

      return { sessionID: session.sessionID };
    }),

    issueCode: os.sessions.issueCode.handler(async (options) => {
      requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

      const code = await store.enrolmentCodes.create({});

      return { code: code.code, expiresAt: code.expiresAt };
    }),

    list: os.sessions.list.handler((options) => {
      const current = requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);
      const live = store.sessions.findMany((query) => query.where({ revokedAt: null }));

      return {
        sessions: live.map((session) => ({
          createdAt: session.createdAt,
          current: session.sessionID === current.sessionID,
          deviceName: session.deviceName,
          lastUsedAt: session.lastUsedAt,
          sessionID: session.sessionID,
        })),
      };
    }),

    revoke: os.sessions.revoke.handler(async (options) => {
      requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

      const session = store.sessions.findFirst((query) =>
        query.where({ sessionID: options.input.sessionID }),
      );

      if (session === undefined) {
        throw options.errors.SESSION_NOT_FOUND();
      }

      const revokedAt = session.revokedAt ?? new Date();

      await store.sessions.update(session, {
        data(draft) {
          draft.revokedAt = revokedAt;
        },
      });

      return { revokedAt };
    }),
  },
});

type StoredSession = NonNullable<ReturnType<typeof store.sessions.findFirst>>;

type StoredRecord = ReadonlyDeep<ReturnType<typeof store.records.all>[number]>;

interface RecordStream {
  readonly afterSequence: number;
  readonly signal?: AbortSignal | undefined;
  readonly thread?: string | undefined;
}

// Each record of the thread after the sequence, then each one the store gains, as one event whose
// ID is the record's sequence.
async function* toRecordEvents(stream: RecordStream) {
  const cursor = { after: stream.afterSequence };

  while (stream.signal?.aborted !== true) {
    for (const record of findRecordsAfter(cursor.after, stream.thread)) {
      cursor.after = record.sequence;
      yield withEventMeta({ record: toLogRecord(record) }, { id: String(record.sequence) });
    }

    // oxlint-disable-next-line no-await-in-loop -- the stream sleeps until the next record
    await waitForRecord(stream.signal);
  }
}

function findRecordsAfter(after: number, thread: string | undefined): readonly StoredRecord[] {
  return store.records.findMany(
    (query) =>
      query.where(
        (record) => record.sequence > after && (thread === undefined || record.thread === thread),
      ),
    { orderBy: { sequence: 'asc' } },
  );
}

// A code works for one enrolment, and a retry of that enrolment with its client action ID.
function findUsableCode(code: string, clientActionID: string) {
  return store.enrolmentCodes.findFirst((query) =>
    query.where(
      (stored) =>
        stored.code === code &&
        stored.expiresAt.getTime() > Date.now() &&
        (stored.clientActionID === null || stored.clientActionID === clientActionID),
    ),
  );
}

interface EnrolInput {
  readonly clientActionID: string;
  readonly code: string;
  readonly deviceName: string;

  // The session the code made on an earlier attempt of this enrolment.
  readonly sessionID: string | null;
}

// Uses a code for one enrolment. A retry of that enrolment answers with the session the code
// made the first time.
async function claimEnrolmentCode(input: EnrolInput): Promise<StoredSession> {
  const earlier = store.sessions.findFirst((query) =>
    query.where({ sessionID: input.sessionID ?? '' }),
  );

  const enrolled =
    earlier === undefined
      ? store.sessions.create({ deviceName: input.deviceName })
      : Promise.resolve(earlier);

  const session = await enrolled;

  await store.enrolmentCodes.update((query) => query.where({ code: input.code }), {
    data(draft) {
      draft.clientActionID = input.clientActionID;
      draft.sessionID = session.sessionID;
    },
  });

  return session;
}

// Resolves when the store gains a record or the caller goes away. A collection runs its create
// hooks before it adds the record, so the wait ends a macrotask later, once the record is in.
async function waitForRecord(signal: AbortSignal | undefined): Promise<void> {
  // oxlint-disable-next-line promise/avoid-new -- the store's hook emitter has no promise form
  await new Promise<void>((resolve) => {
    const waiting = new AbortController();

    const stopWaiting = (): void => {
      waiting.abort();

      setTimeout(resolve, 0);
    };

    store.records.hooks.once('create', stopWaiting, { signal: waiting.signal });
    signal?.addEventListener('abort', stopWaiting, { once: true, signal: waiting.signal });
  });
}

const mediaTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

// the API takes an image's type from its bytes; the mock trusts the type the client gives
async function toStoredImage(image: Blob) {
  const mediaType = mediaTypes.find((known) => known === image.type) ?? 'image/png';

  const bytes = await image.bytes();

  return { data: bytes.toBase64(), mediaType };
}
