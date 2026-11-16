import {
  readActionTools,
  readCancelledActionIDs,
  readStopCancelledActions,
} from '@heynixie/actions';
import type { LogRecord } from '@heynixie/log';
import { readProposalsBySequence } from '@heynixie/proposals';
import {
  readTaskDirectory,
  taskExchangeLimitedCodec,
  taskMessageCodec,
  taskStoppedCodec,
} from '@heynixie/tasks';
import { toolResultCodec } from '@heynixie/tools';
import { z } from 'zod';
import type { RecordLookups } from '../contract/to-contract-record';
import type { APIContext } from '../types';
import { readRemovedRecordSequences } from '../utils/read-removed-record-sequences';

const outcomeActionID = z.object({ actionID: z.string() });

const namedKinds: ReadonlySet<string> = new Set([
  taskMessageCodec.kind,
  taskExchangeLimitedCodec.kind,
]);

export async function readRecordLookups(
  context: Pick<APIContext, 'log' | 'settings'>,
  records: readonly LogRecord[],
  known: { readonly removedSequences?: ReadonlySet<number> } = {},
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

  const outcomeActionIDs = records.flatMap((record) => {
    const outcome =
      record.kind === 'action.outcome' ? outcomeActionID.safeParse(record.payload) : null;

    return outcome?.success === true ? [outcome.data.actionID] : [];
  });

  const stopSequences = records
    .filter((record) => record.kind === taskStoppedCodec.kind)
    .map((record) => record.sequence);

  const messaging = { directory: context.settings.taskDirectory };

  const named = records.some((record) => namedKinds.has(record.kind))
    ? await readTaskDirectory(context, messaging)
    : messaging;

  const removedSequences = await (known.removedSequences ??
    readRemovedRecordSequences(context, records));

  return {
    actionTools: await readActionTools(context, outcomeActionIDs),
    cancelledActionIDs: await readCancelledActionIDs(context, failedActionIDs),
    proposals: await readProposalsBySequence(
      context.log.writer.db,
      records.map((record) => record.sequence),
    ),
    removedSequences,
    stopCancelledActions: await readStopCancelledActions(context, stopSequences),
    taskDirectory: named.directory,
  };
}
