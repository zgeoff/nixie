import type { Projection } from '@heynixie/log';
import type { DefinitionsTables } from './types';

export const ruleFiresProjection: Projection = {
  table: 'rule_fires',
  keyColumn: 'rule_id',
  fold: async (tx, record) => {
    const ruleID = record.decision?.rule?.id;

    if (ruleID === undefined) {
      return [];
    }

    await tx
      .$extendTables<DefinitionsTables>()
      .insertInto('rule_fires')
      .values({ rule_id: ruleID, last_fired_at: record.recordedAt.getTime() })
      .onConflict((conflict) =>
        conflict.column('rule_id').doUpdateSet((eb) => ({
          last_fired_at: eb.ref('excluded.last_fired_at'),
        })),
      )
      .execute();

    return [ruleID];
  },
};
