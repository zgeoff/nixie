import type { EnvelopeRecord, Projection } from '@heynixie/log';
import { triggerFiredCodec, triggerSkippedCodec } from '@heynixie/tasks';
import type { Transaction } from 'kysely';
import { triggerArmedCodec } from '../record/trigger-armed-codec';
import type { TriggersTables } from '../types';
import { toCanonicalJSON } from '../utils/to-canonical-json';

export const triggerDefinitionsProjection: Projection = {
  table: 'trigger_definitions',
  keyColumn: 'definition_id',
  fold: (tx, record) => {
    const db = tx.$extendTables<TriggersTables>();

    if (record.kind === 'trigger.armed') {
      return foldArmed(db, record);
    }

    if (record.kind === 'trigger.fired') {
      const fired = triggerFiredCodec.decode(record.payload);

      return moveWatermark(db, record, fired.definitionID, fired.scheduledFor);
    }

    if (record.kind === 'trigger.skipped') {
      const skipped = triggerSkippedCodec.decode(record.payload);
      const newest = skipped.scheduledFor.at(-1);

      return newest === undefined
        ? Promise.resolve([])
        : moveWatermark(db, record, skipped.definitionID, newest);
    }

    return Promise.resolve([]);
  },
};

async function foldArmed(
  db: Transaction<TriggersTables>,
  record: EnvelopeRecord,
): Promise<readonly string[]> {
  const payload = triggerArmedCodec.decode(record.payload);
  const changed: string[] = [];

  for (const definition of payload.armed) {
    const row = await db
      .selectFrom('trigger_definitions')
      .select(['definition_hash', 'trigger', 'after'])
      .where('definition_id', '=', definition.definitionID)
      .executeTakeFirst();

    const trigger = toCanonicalJSON(definition.trigger);
    const isNew = row === undefined || row.definition_hash === null || row.trigger !== trigger;
    const after = isNew ? Math.max(row?.after ?? 0, record.recordedAt.getTime()) : row.after;

    await db
      .insertInto('trigger_definitions')
      .values({
        definition_id: definition.definitionID,
        source_id: definition.source,
        definition_hash: definition.definitionHash,
        target: definition.target,
        trigger,
        after,
        updated_sequence: record.sequence,
      })
      .onConflict((conflict) =>
        conflict.column('definition_id').doUpdateSet({
          source_id: definition.source,
          definition_hash: definition.definitionHash,
          target: definition.target,
          trigger,
          after,
          updated_sequence: record.sequence,
        }),
      )
      .execute();

    changed.push(definition.definitionID);
  }

  for (const definitionID of payload.withdrawn) {
    const row = await db
      .updateTable('trigger_definitions')
      .set({ definition_hash: null, updated_sequence: record.sequence })
      .where('definition_id', '=', definitionID)
      .returning('definition_id')
      .executeTakeFirst();

    if (row !== undefined) {
      changed.push(definitionID);
    }
  }

  return changed;
}

// A one-shot never moves its watermark, and no fold moves it back.
async function moveWatermark(
  db: Transaction<TriggersTables>,
  record: EnvelopeRecord,
  definitionID: string,
  scheduledFor: string,
): Promise<readonly string[]> {
  const row = await db
    .selectFrom('trigger_definitions')
    .select(['trigger', 'after'])
    .where('definition_id', '=', definitionID)
    .executeTakeFirst();

  if (row === undefined || row.trigger.startsWith('{"at":')) {
    return [];
  }

  await db
    .updateTable('trigger_definitions')
    .set({
      after: Math.max(row.after, Date.parse(scheduledFor)),
      updated_sequence: record.sequence,
    })
    .where('definition_id', '=', definitionID)
    .execute();

  return [definitionID];
}
