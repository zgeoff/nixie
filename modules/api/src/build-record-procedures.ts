import type { LogRecord } from '@heynixie/contract';
import { withEventMeta } from '@orpc/server';
import { apiImplementer } from './api-implementer';
import { requireCaller } from './require-caller';
import { subscribeToThreadRecords } from './subscribe-to-thread-records';
import type { APIContext } from './types';

// Builds the live stream. Each event's ID is its record's sequence, so a client that reconnects
// with Last-Event-ID resumes after the last record it received, with no gap and no repeat. The
// stream answers under its first name too, for the clients of earlier releases.
export function buildRecordProcedures(context: APIContext) {
  // The handler checks the session before it returns the stream, so the API refuses a revoked
  // device with a plain 401 and opens a stream only for a session it accepts.
  const follow = apiImplementer.records.follow.handler(async (options) => {
    const caller = await requireCaller(
      context,
      options.context.sessionToken,
      options.errors.UNAUTHORIZED,
    );

    return toRecordEvents(
      subscribeToThreadRecords(context, caller, {
        afterSequence: pickAfterSequence(options.input.afterSequence, options.lastEventId),
        thread: options.input.thread,
        signal: options.signal,
        buildUnauthorized: options.errors.UNAUTHORIZED,
      }),
    );
  });

  return { log: { follow }, records: { follow } };
}

// Each record as one event whose ID is the record's sequence.
// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- the contract's record type is mutable
async function* toRecordEvents(records: AsyncIterable<LogRecord>) {
  for await (const record of records) {
    yield withEventMeta({ record }, { id: String(record.sequence) });
  }
}

// a last event ID that is not a sequence leaves the input's own start
function pickAfterSequence(afterSequence: number, lastEventID: string | undefined): number {
  return lastEventID !== undefined && /^\d{1,15}$/u.test(lastEventID)
    ? Number(lastEventID)
    : afterSequence;
}
