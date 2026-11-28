import {
  readActionCalls,
  readCancelledActionIDs,
  readStopCancelledActions,
} from '@heynixie/actions';
import type { DefinitionNotice } from '@heynixie/contract';
import { definitionChangedCodec } from '@heynixie/definitions';
import type { LogRecord } from '@heynixie/log';
import { modelReplyCodec, readVoidedReplies } from '@heynixie/models';
import {
  formatPlaceKey,
  placesActedCodec,
  placesNarrowedCodec,
  readPlaces,
} from '@heynixie/policy';
import { readProposalsBySequence } from '@heynixie/proposals';
import { readReminderVersion } from '@heynixie/reminders';
import {
  conversationTaskID,
  missingReminderBrief,
  parseTriggerFired,
  readTaskDirectory,
  readUnlistedProfiles,
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
  const hasNames = records.some((record) => namedKinds.has(record.kind));
  const named = hasNames ? await readTaskDirectory(context, messaging) : messaging;
  const unlisted = hasNames ? await readUnlistedProfiles(context, named.directory) : [];

  const removedSequences = await (known.removedSequences ??
    readRemovedRecordSequences(context, records));

  const reminders = await readReminders(context, records);

  return {
    actions: await readActionCalls(context, outcomeActionIDs),
    cancelledActionIDs: await readCancelledActionIDs(context, failedActionIDs),
    definitionNotices: await readNoticesBySequence(context, records),
    placeActs: await readPlaceActs(context, records),
    placeNarrowings: await readPlaceNarrowings(context, records),
    proposals: await readProposalsBySequence(
      context.log.writer.db,
      records.map((record) => record.sequence),
    ),
    reminders,
    removedSequences,
    stopCancelledActions: await readStopCancelledActions(context, stopSequences),
    taskDirectory: [...named.directory, ...unlisted],
    voidedReplies: await readVoidedReplies(
      context.log.writer.db,
      records
        .filter((record) => record.kind === modelReplyCodec.kind)
        .map((record) => record.sequence),
    ),
  };
}

// The name and the note of the version that each reminder fire pins, or a note when the version is
// gone.
async function readReminders(
  context: Pick<APIContext, 'log'>,
  records: readonly LogRecord[],
): Promise<RecordLookups['reminders']> {
  const reminders = new Map<number, { name: string | null; note: string }>();

  for (const record of records) {
    const fire =
      record.kind === 'trigger.fired' && record.thread === conversationTaskID
        ? parseTriggerFired(record.payload)
        : null;

    if (fire !== null && fire.kind !== 'poll') {
      const version = await readReminderVersion(context.log.writer.db, fire.definitionHash);

      reminders.set(record.sequence, {
        name: version?.name ?? null,
        note: version?.note ?? missingReminderBrief,
      });
    }
  }

  return reminders;
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

// The key of the place that each places.acted record names. A place's IDs sit in the payload for a
// site and in the erasable fields for an address, phone number or handle, so a forgotten place
// leaves no line.
async function readPlaceActs(
  context: Pick<APIContext, 'log'>,
  records: readonly LogRecord[],
): Promise<RecordLookups['placeActs']> {
  const named = records.flatMap((record) => {
    if (record.kind !== placesActedCodec.kind) {
      return [];
    }

    const payload = placesActedCodec.tryDecodePartial(record.payload);

    const erasableID =
      record.erasable.status === 'readable' ? record.erasable.fields['placeID'] : undefined;

    const placeID = payload?.placeID ?? (typeof erasableID === 'string' ? erasableID : undefined);

    return placeID === undefined ? [] : [{ sequence: record.sequence, placeID }];
  });

  if (named.length === 0) {
    return new Map();
  }

  const places = await readPlaces(context.log, {
    placeIDs: named.map((entry) => entry.placeID),
  });

  const keys = new Map(places.map((place) => [place.placeID, formatPlaceKey(place.key)]));

  return new Map(
    named.flatMap((entry) => {
      const key = keys.get(entry.placeID);

      return key === undefined ? [] : [[entry.sequence, key] as const];
    }),
  );
}

// The key of the place that each places.narrowed record names. The record holds the short ID alone,
// so a place whose key a forget took shows by its ID.
async function readPlaceNarrowings(
  context: Pick<APIContext, 'log'>,
  records: readonly LogRecord[],
): Promise<RecordLookups['placeNarrowings']> {
  const named = records.flatMap((record) => {
    const narrowed =
      record.kind === placesNarrowedCodec.kind
        ? placesNarrowedCodec.tryDecodePartial(record.payload)
        : undefined;

    return narrowed?.shortID === undefined
      ? []
      : [{ sequence: record.sequence, shortID: narrowed.shortID }];
  });

  if (named.length === 0) {
    return new Map();
  }

  const places = await readPlaces(context.log, { isRemovedIncluded: true });

  const keys = new Map(places.map((place) => [place.shortID, formatPlaceKey(place.key)]));

  return new Map(named.map((entry) => [entry.sequence, keys.get(entry.shortID) ?? entry.shortID]));
}
