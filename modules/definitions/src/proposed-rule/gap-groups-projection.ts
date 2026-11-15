import type { Projection } from '@heynixie/log';
import { actionAnsweredCodec } from '@heynixie/policy';
import { proposalsWithdrawnCodec } from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import type { DefinitionsTables } from '../types';
import { ruleAnsweredCodec } from './rule-answered-codec';
import { ruleLapsedCodec } from './rule-lapsed-codec';
import { ruleProposedCodec } from './rule-proposed-codec';

// A group exists once an answer joins it. Its open proposed rule is set by the proposal and cleared
// by every way the proposal closes, in the record that closes it. Not now and a lapse set the quiet
// time that the record carries.
export const gapGroupsProjection: Projection = {
  table: 'gap_groups',
  keyColumn: 'group_hash',
  fold: async (tx, record) => {
    const tables = tx.$extendTables<DefinitionsTables>();

    if (record.kind === actionAnsweredCodec.kind) {
      const answered = actionAnsweredCodec.decode(record.payload);

      if (answered.groupHash === undefined) {
        return [];
      }

      await tables
        .insertInto('gap_groups')
        .values({ group_hash: answered.groupHash })
        .onConflict((conflict) => conflict.doNothing())
        .execute();

      return [answered.groupHash];
    }

    if (record.kind === ruleProposedCodec.kind) {
      const proposed = ruleProposedCodec.decode(record.payload);

      await tables
        .insertInto('gap_groups')
        .values({ group_hash: proposed.groupHash, proposal_id: proposed.proposalID })
        .onConflict((conflict) =>
          conflict.column('group_hash').doUpdateSet({ proposal_id: proposed.proposalID }),
        )
        .execute();

      return [proposed.groupHash];
    }

    if (record.kind === ruleAnsweredCodec.kind) {
      const answered = ruleAnsweredCodec.decode(record.payload);

      return closeProposal(tx, answered.proposalID, answered.quietUntil ?? null);
    }

    if (record.kind === ruleLapsedCodec.kind) {
      const lapsed = ruleLapsedCodec.decode(record.payload);

      return closeProposal(tx, lapsed.proposalID, lapsed.quietUntil);
    }

    if (record.kind === proposalsWithdrawnCodec.kind) {
      return closeProposal(tx, proposalsWithdrawnCodec.decode(record.payload).proposalID, null);
    }

    return [];
  },
};

async function closeProposal(
  tx: Transaction<unknown>,
  proposalID: string,
  quietUntil: number | null,
): Promise<readonly string[]> {
  const tables = tx.$extendTables<DefinitionsTables>();

  const group = await tables
    .selectFrom('gap_groups')
    .select('group_hash')
    .where('proposal_id', '=', proposalID)
    .executeTakeFirst();

  if (group === undefined) {
    return [];
  }

  const change =
    quietUntil === null ? { proposal_id: null } : { proposal_id: null, quiet_until: quietUntil };

  await tables
    .updateTable('gap_groups')
    .set(change)
    .where('group_hash', '=', group.group_hash)
    .execute();

  return [group.group_hash];
}
