import type { EnvelopeRecord, Projection } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { match } from 'ts-pattern';
import type { MomentTables } from './moment-types';
import type { MomentRecord } from './parse-moment-record';
import { parseMomentRecord } from './parse-moment-record';

export const momentsProjection: Projection = {
  table: 'moments',
  keyColumn: 'moment_id',
  fold: async (tx, record) => {
    const parsed = parseMomentRecord(record);

    if (parsed === null) {
      return [];
    }

    await applyMomentRecord(tx.$extendTables<MomentTables>(), parsed, record);

    return [parsed.momentID];
  },
};

async function applyMomentRecord(
  db: Transaction<MomentTables>,
  parsed: MomentRecord,
  record: EnvelopeRecord,
): Promise<void> {
  if (parsed.kind === 'moment_kept') {
    await db
      .insertInto('moments')
      .values({
        moment_id: parsed.momentID,
        short_id: parsed.shortID,
        thread: parsed.thread,
        first_sequence: parsed.firstSequence,
        last_sequence: parsed.lastSequence,
        state: 'active',
        version: 1,
        kept_by: parsed.keptBy,
        kept_thread: parsed.keptThread,
        kept_model: parsed.model,
        kept_at: record.recordedAt.getTime(),
        kept_sequence: record.sequence,
        title_sequence: record.sequence,
        note_sequence: null,
        edited_at: null,
        updated_sequence: record.sequence,
      })
      .execute();

    return;
  }

  await db
    .updateTable('moments')
    .set({ updated_sequence: record.sequence, ...buildMomentUpdate(parsed, record) })
    .where('moment_id', '=', parsed.momentID)
    .execute();
}

type MomentChangeRecord = Exclude<MomentRecord, { readonly kind: 'moment_kept' }>;

function buildMomentUpdate(parsed: MomentChangeRecord, record: EnvelopeRecord) {
  return match(parsed)
    .with({ kind: 'moment_edited' }, (edited) => ({
      version: edited.version,
      edited_at: record.recordedAt.getTime(),
      ...match(edited.change)
        .with({ kind: 'edges' }, (change) => ({
          first_sequence: change.firstSequence,
          last_sequence: change.lastSequence,
        }))
        .with({ kind: 'title' }, () => ({ title_sequence: record.sequence }))
        .with({ kind: 'note' }, () => ({ note_sequence: record.sequence }))
        .with({ kind: 'reflection' }, { kind: 'reflection_removed' }, () => ({}))
        .exhaustive(),
    }))
    .with({ kind: 'moment_linked' }, (linked) => ({ version: linked.version }))
    .with({ kind: 'moment_retired' }, (retired) => ({
      version: retired.version,
      state: retired.isRetired ? ('retired' as const) : ('active' as const),
    }))
    .with({ kind: 'moment_destroyed' }, (destroyed) => ({
      state: destroyed.stage === 'started' ? ('destroying' as const) : ('destroyed' as const),
    }))
    .exhaustive();
}
