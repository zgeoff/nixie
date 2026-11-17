import type { EnvelopeRecord, Projection } from '@heynixie/log';
import { triggerFiredCodec, triggerSkippedCodec } from '@heynixie/tasks';
import { findReminderID, toCanonicalJSON } from '@heynixie/triggers';
import type { Transaction } from 'kysely';
import { z } from 'zod';
import { reminderCancelledCodec } from '../record/reminder-cancelled-codec';
import { reminderSetCodec } from '../record/reminder-set-codec';
import { reminderUpdatedCodec } from '../record/reminder-updated-codec';
import type { RemindersTables } from '../types';

// Folds from records only: the name and the note sit in reminder_versions, which the writer fills.
export const remindersProjection: Projection = {
  table: 'reminders',
  keyColumn: 'reminder_id',
  fold: async (tx, record) => {
    const db = tx.$extendTables<RemindersTables>();

    if (record.kind === 'reminder.set') {
      return foldSet(db, record);
    }

    if (record.kind === 'reminder.updated') {
      const updated = reminderUpdatedCodec.decode(record.payload);

      await db
        .updateTable('reminders')
        .set({
          reminder_hash: updated.hash,
          trigger: toCanonicalJSON(updated.trigger),
          updated_sequence: record.sequence,
        })
        .where('reminder_id', '=', updated.reminderID)
        .execute();

      return [updated.reminderID];
    }

    if (record.kind === 'reminder.cancelled') {
      const cancelled = reminderCancelledCodec.decode(record.payload);

      await db
        .updateTable('reminders')
        .set({ state: 'cancelled', updated_sequence: record.sequence })
        .where('reminder_id', '=', cancelled.reminderID)
        .execute();

      return [cancelled.reminderID];
    }

    if (record.kind === 'trigger.fired') {
      return foldFired(db, record);
    }

    if (record.kind === 'trigger.skipped') {
      return foldSkipped(db, record);
    }

    return [];
  },
};

async function foldSet(
  db: Transaction<RemindersTables>,
  record: EnvelopeRecord,
): Promise<readonly string[]> {
  const set = reminderSetCodec.decode(record.payload);

  await db
    .insertInto('reminders')
    .values({
      reminder_id: set.reminderID,
      short_id: set.shortID,
      reminder_hash: set.hash,
      trigger: toCanonicalJSON(set.trigger),
      state: 'active',
      origin: set.origin,
      set_sequence: record.sequence,
      fired_at: null,
      recent_fires: '[]',
      updated_sequence: record.sequence,
    })
    .execute();

  return [set.reminderID];
}

const recentFireCount = 3;
const firesSchema = z.array(z.string());

async function foldFired(
  db: Transaction<RemindersTables>,
  record: EnvelopeRecord,
): Promise<readonly string[]> {
  const fired = triggerFiredCodec.decode(record.payload);
  const reminderID = findReminderID(fired.definitionID);

  if (reminderID === null) {
    return [];
  }

  const row = await db
    .selectFrom('reminders')
    .select(['trigger', 'recent_fires'])
    .where('reminder_id', '=', reminderID)
    .executeTakeFirst();

  if (row === undefined) {
    return [];
  }

  const fires = [...firesSchema.parse(JSON.parse(row.recent_fires)), fired.firedAt].slice(
    -recentFireCount,
  );

  const isOneOff = row.trigger.startsWith('{"at":');

  await db
    .updateTable('reminders')
    .set({
      recent_fires: JSON.stringify(fires),
      updated_sequence: record.sequence,
      ...(isOneOff ? { state: 'fired' as const, fired_at: Date.parse(fired.firedAt) } : {}),
    })
    .where('reminder_id', '=', reminderID)
    .execute();

  return [reminderID];
}

// A one-off whose slot passed unfired is spent too, so it never reads as waiting.
async function foldSkipped(
  db: Transaction<RemindersTables>,
  record: EnvelopeRecord,
): Promise<readonly string[]> {
  const skipped = triggerSkippedCodec.decode(record.payload);
  const reminderID = findReminderID(skipped.definitionID);

  if (reminderID === null) {
    return [];
  }

  const row = await db
    .selectFrom('reminders')
    .select('trigger')
    .where('reminder_id', '=', reminderID)
    .executeTakeFirst();

  if (row === undefined || !row.trigger.startsWith('{"at":')) {
    return [];
  }

  await db
    .updateTable('reminders')
    .set({
      state: 'fired',
      fired_at: Date.parse(skipped.recordedAt),
      updated_sequence: record.sequence,
    })
    .where('reminder_id', '=', reminderID)
    .execute();

  return [reminderID];
}
