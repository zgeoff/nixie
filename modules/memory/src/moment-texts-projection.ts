import type { Projection } from '@heynixie/log';
import type { MomentTables } from './moment-types';
import { parseMomentRecord } from './parse-moment-record';

export const momentTextsProjection: Projection = {
  table: 'moment_texts',
  keyColumn: 'sequence',
  fold: async (tx, record) => {
    const parsed = parseMomentRecord(record);

    const holdsText =
      parsed?.kind === 'moment_kept' ||
      (parsed?.kind === 'moment_edited' &&
        parsed.change.kind !== 'edges' &&
        parsed.change.kind !== 'reflection_removed');

    if (parsed === null || !holdsText) {
      return [];
    }

    await tx
      .$extendTables<MomentTables>()
      .insertInto('moment_texts')
      .values({ sequence: record.sequence, moment_id: parsed.momentID })
      .execute();

    return [String(record.sequence)];
  },
};
