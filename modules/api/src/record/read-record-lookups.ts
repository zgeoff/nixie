import {
  readActionCalls,
  readCancelledActionIDs,
  readStopCancelledActions,
} from '@heynixie/actions';
import type { DefinitionNotice } from '@heynixie/contract';
import { definitionChangedCodec } from '@heynixie/definitions';
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
  context: Pick<APIContext, 'log' | 'readDefinitionNotices' | 'readDefinitionVersion' | 'settings'>,
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
    definitionNotices: await readNoticesBySequence(context, records),
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

// The notice of each definition.changed record. A record whose change has no row gets none.
async function readNoticesBySequence(
  context: Pick<APIContext, 'log' | 'readDefinitionNotices'>,
  records: readonly LogRecord[],
): Promise<ReadonlyMap<number, DefinitionNotice>> {
  const changed = records.flatMap((record) => {
    const change =
      record.kind === definitionChangedCodec.kind
        ? definitionChangedCodec.tryDecodePartial(record.payload)
        : undefined;

    return typeof change?.changeID === 'string'
      ? [{ sequence: record.sequence, changeID: change.changeID }]
      : [];
  });

  const notices =
    context.readDefinitionNotices === undefined || changed.length === 0
      ? new Map<string, DefinitionNotice>()
      : await context.readDefinitionNotices(
          context.log.writer.db,
          changed.map((entry) => entry.changeID),
        );

  return new Map(
    changed.flatMap((entry) => {
      const notice = notices.get(entry.changeID);

      return notice === undefined ? [] : [[entry.sequence, notice] as const];
    }),
  );
}
