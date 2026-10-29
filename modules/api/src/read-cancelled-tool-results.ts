import { readCancelledActionIDs } from '@heynixie/actions';
import type { LogRecord } from '@heynixie/log';
import { toolResultCodec } from '@heynixie/tools';
import type { APIContext } from './types';

export function readCancelledToolResults(
  context: Pick<APIContext, 'log'>,
  records: readonly LogRecord[],
): Promise<ReadonlySet<string>> {
  const actionIDs = records.flatMap((record) => {
    const result =
      record.kind === toolResultCodec.kind
        ? toolResultCodec.tryDecodePartial(record.payload)
        : undefined;

    return result?.outcome === 'failed' && typeof result.actionID === 'string'
      ? [result.actionID]
      : [];
  });

  return readCancelledActionIDs(context, actionIDs);
}
