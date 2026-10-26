import type { Projection } from '@heynixie/log';
import type { MomentTables } from './moment-types';
import { parseMomentRecord } from './parse-moment-record';

export const momentReflectionsProjection: Projection = {
  table: 'moment_reflections',
  keyColumn: 'reflection_id',
  fold: async (tx, record) => {
    const parsed = parseMomentRecord(record);

    if (parsed?.kind !== 'moment_edited') {
      return [];
    }

    const db = tx.$extendTables<MomentTables>();
    const at = record.recordedAt.getTime();
    const change = parsed.change;

    if (change.kind === 'reflection') {
      await db
        .insertInto('moment_reflections')
        .values({
          reflection_id: change.reflectionID,
          moment_id: parsed.momentID,
          model: change.model,
          text_sequence: record.sequence,
          created_at: at,
          updated_at: at,
          is_removed: 0,
        })
        .onConflict((conflict) =>
          conflict
            .column('reflection_id')
            .doUpdateSet({ text_sequence: record.sequence, updated_at: at }),
        )
        .execute();

      return [change.reflectionID];
    }

    if (change.kind === 'reflection_removed') {
      await db
        .updateTable('moment_reflections')
        .set({ is_removed: 1, updated_at: at })
        .where('reflection_id', '=', change.reflectionID)
        .execute();

      return [change.reflectionID];
    }

    return [];
  },
};
