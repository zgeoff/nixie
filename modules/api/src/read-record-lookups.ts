import { readCancelledActionIDs, readStopCancelledActions } from '@heynixie/actions';
import type { LogRecord } from '@heynixie/log';
import {
  readTaskDirectory,
  taskExchangeLimitedCodec,
  taskMessageCodec,
  taskStoppedCodec,
} from '@heynixie/tasks';
import { toolResultCodec } from '@heynixie/tools';
import type { RecordLookups } from './to-contract-record';
import type { APIContext } from './types';

const namedKinds: ReadonlySet<string> = new Set([
  taskMessageCodec.kind,
  taskExchangeLimitedCodec.kind,
]);

export async function readRecordLookups(
  context: Pick<APIContext, 'log' | 'settings'>,
  records: readonly LogRecord[],
): Promise<RecordLookups> {
  const failedActionIDs = records.flatMap((record) => {
    const result =
      record.kind === toolResultCodec.kind
        ? toolResultCodec.tryDecodePartial(record.payload)
        : undefined;

    return result?.outcome === 'failed' && typeof result.actionID === 'string'
      ? [result.actionID]
      : [];
  });

  const stopSequences = records
    .filter((record) => record.kind === taskStoppedCodec.kind)
    .map((record) => record.sequence);

  const messaging = { directory: context.settings.taskDirectory };

  const named = records.some((record) => namedKinds.has(record.kind))
    ? await readTaskDirectory(context, messaging)
    : messaging;

  return {
    cancelledActionIDs: await readCancelledActionIDs(context, failedActionIDs),
    stopCancelledActions: await readStopCancelledActions(context, stopSequences),
    taskDirectory: named.directory,
  };
}
