import type { LogRecord } from '@heynixie/contract';
import { withEventMeta } from '@orpc/server';
import { apiImplementer } from './api-implementer';
import { requireCaller } from './require-caller';
import { subscribeToThreadRecords } from './subscribe-to-thread-records';
import type { APIContext } from './types';

export function createRecordProcedures(context: APIContext) {
  // HTTP sends the status before the stream's first event, so the handler checks the session first
  // to refuse a revoked device with a plain 401.
  const follow = apiImplementer.records.follow.handler(async (options) => {
    const caller = await requireCaller(
      context,
      options.context.sessionToken,
      options.errors.UNAUTHORIZED,
    );

    return streamRecordEvents(
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

async function* streamRecordEvents(records: AsyncIterable<LogRecord>) {
  for await (const record of records) {
    yield withEventMeta({ record }, { id: String(record.sequence) });
  }
}

function pickAfterSequence(afterSequence: number, lastEventID: string | undefined): number {
  return lastEventID !== undefined && /^\d{1,15}$/u.test(lastEventID)
    ? Number(lastEventID)
    : afterSequence;
}
