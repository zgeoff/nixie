import { withEventMeta } from '@orpc/server';
import { apiImplementer } from './api-implementer';
import { requireCaller } from './require-caller';
import { subscribeToThreadRecords } from './subscribe-to-thread-records';
import type { APIContext } from './types';

// Builds the live stream. Each event's ID is its record's sequence, so a client that reconnects
// with Last-Event-ID resumes after the last record it received, with no gap and no repeat.
export function buildLogProcedures(context: APIContext) {
  return {
    follow: apiImplementer.log.follow.handler(async function* followLog(options) {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );
      const records = subscribeToThreadRecords(context, caller, {
        afterSequence: pickAfterSequence(options.input.afterSequence, options.lastEventId),
        thread: options.input.thread,
        signal: options.signal,
        buildUnauthorized: options.errors.UNAUTHORIZED,
      });

      for await (const record of records) {
        yield withEventMeta({ record }, { id: String(record.sequence) });
      }
    }),
  };
}

// a last event ID that is not a sequence leaves the input's own start
function pickAfterSequence(afterSequence: number, lastEventID: string | undefined): number {
  return lastEventID !== undefined && /^\d{1,15}$/u.test(lastEventID)
    ? Number(lastEventID)
    : afterSequence;
}
