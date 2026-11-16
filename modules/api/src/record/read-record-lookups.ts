import {
  readActionCalls,
  readCancelledActionIDs,
  readStopCancelledActions,
} from '@heynixie/actions';
import type { LogRecord } from '@heynixie/log';
import { readProposalsBySequence } from '@heynixie/proposals';
import {
  conversationTaskID,
  missingReminderBrief,
  parseTriggerFired,
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
  context: Pick<APIContext, 'log' | 'readDefinitionVersion' | 'settings'>,
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

  const reminderBriefs = await readReminderBriefs(context, records);

  return {
    actions: await readActionCalls(context, outcomeActionIDs),
    cancelledActionIDs: await readCancelledActionIDs(context, failedActionIDs),
    proposals: await readProposalsBySequence(
      context.log.writer.db,
      records.map((record) => record.sequence),
    ),
    reminderBriefs,
    removedSequences,
    stopCancelledActions: await readStopCancelledActions(context, stopSequences),
    taskDirectory: named.directory,
  };
}

// The brief of the version that each reminder fire pins, or a note when the version is gone.
async function readReminderBriefs(
  context: Pick<APIContext, 'log' | 'readDefinitionVersion'>,
  records: readonly LogRecord[],
): Promise<ReadonlyMap<number, string>> {
  const briefs = new Map<number, string>();

  for (const record of records) {
    const fire =
      record.kind === 'trigger.fired' && record.thread === conversationTaskID
        ? parseTriggerFired(record.payload)
        : null;

    if (fire !== null && fire.kind !== 'poll') {
      const version = await context.readDefinitionVersion(
        context.log.writer.db,
        fire.definitionHash,
      );

      briefs.set(record.sequence, version?.brief ?? missingReminderBrief);
    }
  }

  return briefs;
}
