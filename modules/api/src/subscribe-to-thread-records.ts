import type { LogRecord as ContractRecord } from '@heynixie/contract';
import { subscribeToRecords } from '@heynixie/log';
import { toContractRecord } from './to-contract-record';
import type { APIContext, Identity } from './types';

interface ThreadRecordsOptions {
  readonly afterSequence: number;
  readonly thread?: string | undefined;
  readonly signal?: AbortSignal | undefined;

  // the error that ends the stream once the caller's own session is revoked
  readonly buildUnauthorized: () => Error;
}

// Follows the log for a client: each record after a sequence that belongs to a thread, or to the
// thread asked for, then each record as it commits. It ends when the signal aborts, and fails once
// a record revokes the caller's session, so a revoked device stops receiving at once.
export async function* subscribeToThreadRecords(
  context: APIContext,
  caller: Identity,
  options: ThreadRecordsOptions,
): AsyncGenerator<ContractRecord, void, undefined> {
  const entries = subscribeToRecords(context.log, {
    afterSequence: options.afterSequence,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });

  for await (const entry of entries) {
    const record = entry.record;

    if (record.kind === 'session.revoked' && record.payload['identityID'] === caller.identityID) {
      throw options.buildUnauthorized();
    }
    const visible = toContractRecord(record);

    if (visible !== null && (options.thread === undefined || visible.thread === options.thread)) {
      yield visible;
    }
  }
}
