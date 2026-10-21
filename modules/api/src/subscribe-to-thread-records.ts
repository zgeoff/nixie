import type { LogRecord as ContractRecord } from '@heynixie/contract';
import { subscribeToRecords } from '@heynixie/log';
import { sessionRevokedCodec } from './session-revoked-codec';
import { toContractRecord } from './to-contract-record';
import type { APIContext, APITables, Identity } from './types';

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
  const head = await context.log.writer.db
    .$extendTables<APITables>()
    .selectFrom('records')
    .select((expressionBuilder) =>
      expressionBuilder.fn
        .coalesce(expressionBuilder.fn.max('sequence'), expressionBuilder.lit(0))
        .as('sequence'),
    )
    .executeTakeFirstOrThrow();

  // a start past the head would skip the record that revokes the caller, so the stream reads from
  // the head at most
  const entries = subscribeToRecords(context.log, {
    afterSequence: Math.min(options.afterSequence, head.sequence),
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

    const visible = toContractRecord(record);

    if (visible !== null && (options.thread === undefined || visible.thread === options.thread)) {
      yield visible;
    }
  }
}
