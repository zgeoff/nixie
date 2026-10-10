// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import type { LogRecord } from '@heynixie/contract';
import { contract, sessionCookieName } from '@heynixie/contract';
import { implement, withEventMeta } from '@orpc/server';
import type { ResponseHeadersPluginContext } from '@orpc/server/plugins';
import type { ReadonlyDeep } from '../types';
import { store } from './store';

interface MockAPIContext extends ResponseHeadersPluginContext {
  // The device session's token, from the bearer header or the cookie.
  readonly sessionToken: string | undefined;
}

const os = implement(contract).$context<MockAPIContext>();

// A stand-in for nixie's API that implements the contract over the mock store, so the client's
// real link, serialisation and typed errors run in every test.
export const mockAPIRouter = os.router({
  conversation: {
    read: os.conversation.read.handler((options) => {
      requireSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

      const limit = options.input.limit ?? 50;
      const before = options.input.beforeSequence ?? Number.POSITIVE_INFINITY;
      const page = store.records.findMany(
        (query) =>
          query.where(
            (record) => record.thread === options.input.thread && record.sequence < before,
          ),
        { orderBy: { sequence: 'asc' } },
      );

      return {
        hasEarlier: page.length > limit,
        readAtSequence: Math.max(0, ...store.records.all().map((record) => record.sequence)),
        records: page.slice(-limit).map((record) => toLogRecord(record)),
      };
    }),

    send: os.conversation.send.handler(async (options) => {
      requireSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

      const input = options.input;
      const earlier = store.records.findFirst((query) =>
        query.where((record) => record.message?.clientMessageId === input.clientMessageId),
      );

      if (earlier === undefined) {
        const record = await store.records.create({
          kind: 'owner_message',
          message: { clientMessageId: input.clientMessageId, spans: input.spans, text: input.text },
          thread: input.thread,
        });

        return { duplicate: false, sequence: record.sequence };
      }
      if (earlier.message?.text !== input.text || earlier.thread !== input.thread) {
        throw options.errors.CLIENT_ACTION_ID_REUSED();
      }

      return { duplicate: true, sequence: earlier.sequence };
    }),
  },
  log: {
    follow: os.log.follow.handler(async function* followLog(options) {
      requireSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

      const cursor = { after: options.input.afterSequence };

      while (options.signal?.aborted !== true) {
        for (const record of findRecordsAfter(cursor.after, options.input.thread)) {
          cursor.after = record.sequence;
          yield withEventMeta({ record: toLogRecord(record) }, { id: String(record.sequence) });
        }

        // oxlint-disable-next-line no-await-in-loop -- the stream sleeps until the next record
        await waitForRecord(options.signal);
      }
    }),
  },
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

      options.context.resHeaders?.append(
        'set-cookie',
        `${sessionCookieName}=${session.token}; Path=/; HttpOnly; Secure; SameSite=Strict`,
      );

      return { sessionID: session.sessionID };
    }),

    issueCode: os.sessions.issueCode.handler(async (options) => {
      requireSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

      const code = await store.enrolmentCodes.create({});

      return { code: code.code, expiresAt: code.expiresAt };
    }),

    list: os.sessions.list.handler((options) => {
      const current = requireSession(options.context.sessionToken, options.errors.UNAUTHORIZED);
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
      requireSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

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

function requireSession(
  sessionToken: string | undefined,
  buildUnauthorized: () => Error,
): StoredSession {
  const session = store.sessions.findFirst((query) =>
    query.where({ revokedAt: null, token: sessionToken ?? '' }),
  );

  if (session === undefined) {
    throw buildUnauthorized();
  }

  return session;
}

type StoredRecord = ReadonlyDeep<ReturnType<typeof store.records.all>[number]>;

function toLogRecord(record: StoredRecord): LogRecord {
  return {
    kind: record.kind,
    ...(record.message === undefined ? {} : { message: toLogMessage(record.message) }),
    recordedAt: record.recordedAt,
    sequence: record.sequence,
    thread: record.thread,
  };
}

type LogMessage = NonNullable<LogRecord['message']>;

function toLogMessage(message: NonNullable<StoredRecord['message']>): LogMessage {
  const spans = message.spans?.map((span) => ({
    end: span.end,
    source: span.source,
    start: span.start,
  }));

  return {
    ...(message.clientMessageId === undefined ? {} : { clientMessageId: message.clientMessageId }),
    ...(spans === undefined ? {} : { spans }),
    text: message.text,
  };
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
