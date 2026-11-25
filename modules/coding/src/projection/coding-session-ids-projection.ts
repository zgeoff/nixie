import type { Projection } from '@heynixie/log';
import { codingSessionNamedCodec } from '../record/coding-session-named-codec';
import type { CodingTables } from '../types';

// One row per session that got a short ID. The first naming of a session wins.
export const codingSessionIDsProjection: Projection = {
  table: 'coding_session_ids',
  keyColumn: 'short_id',
  fold: async (tx, record) => {
    if (record.kind !== codingSessionNamedCodec.kind) {
      return [];
    }

    const named = codingSessionNamedCodec.decode(record.payload);

    await tx
      .$extendTables<CodingTables>()
      .insertInto('coding_session_ids')
      .values({
        short_id: named.shortID,
        adapter: named.adapter,
        session_id: named.sessionID,
        named_sequence: record.sequence,
      })
      .onConflict((conflict) => conflict.doNothing())
      .execute();

    return [named.shortID];
  },
};
