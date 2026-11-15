import type { Projection } from '@heynixie/log';
import { actionAnsweredCodec } from '@heynixie/policy';
import type { DefinitionsTables } from '../types';

// One row per approved or declined answer to a no_rule ask. Always allow, a lapse and a
// withdrawal leave no row.
export const gapAnswersProjection: Projection = {
  table: 'gap_answers',
  keyColumn: 'proposal_id',
  fold: async (tx, record) => {
    if (record.kind !== actionAnsweredCodec.kind) {
      return [];
    }

    const answered = actionAnsweredCodec.decode(record.payload);

    if (answered.groupHash === undefined) {
      return [];
    }

    await tx
      .$extendTables<DefinitionsTables>()
      .insertInto('gap_answers')
      .values({
        proposal_id: answered.proposalID,
        group_hash: answered.groupHash,
        answer: answered.answer,
        answered_at: record.recordedAt.getTime(),
        answered_sequence: record.sequence,
      })
      .onConflict((conflict) => conflict.doNothing())
      .execute();

    return [answered.proposalID];
  },
};
