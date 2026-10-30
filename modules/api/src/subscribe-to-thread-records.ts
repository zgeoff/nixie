import type { LogRecord as ContractRecord } from '@heynixie/contract';
import { subscribeToRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readHeadSequence } from './read-head-sequence';
import { readRecordLookups } from './read-record-lookups';
import { sessionRevokedCodec } from './session-revoked-codec';
import { toContractRecord } from './to-contract-record';
import type { APIContext, Identity } from './types';

interface ThreadRecordsOptions {
  readonly afterSequence: number;
  readonly thread?: string | undefined;
  readonly signal?: AbortSignal | undefined;

  readonly buildUnauthorized: () => Error;
}

export async function* subscribeToThreadRecords(
  context: APIContext,
  caller: Identity,
  options: ThreadRecordsOptions,
): AsyncGenerator<ContractRecord, void, undefined> {
  const head = await readHeadSequence(context);

  // a start past the head would skip the record that revokes the caller, so the stream reads from
  // the head at most
  const entries = subscribeToRecords(context.log, {
    afterSequence: Math.min(options.afterSequence, head),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });

  for await (const entry of entries) {
    const record = entry.record;

    if (
      record.kind === sessionRevokedCodec.kind &&
      sessionRevokedCodec.decode(record.payload).identityID === caller.identityID
    ) {
      throw options.buildUnauthorized();
    }

    const isShown =
      record.thread !== null && (options.thread === undefined || record.thread === options.thread);

    if (isShown) {
      const lookups = await readRecordLookups(context, [record]);

      const visible = toContractRecord(record, lookups);

      invariant(visible);
      yield visible;
    }
  }
}
