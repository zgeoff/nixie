import type { Projection } from '@heynixie/log';
import { actionAnsweredCodec } from '@heynixie/policy';
import { proposalsSettledCodec, proposalsWithdrawnCodec } from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import { rulesChangeLapsedCodec } from '../change/rules-change-lapsed-codec';
import type { DefinitionsTables } from '../types';
import { ruleAnsweredCodec } from './rule-answered-codec';
import { ruleLapsedCodec } from './rule-lapsed-codec';
import { ruleProposedCodec } from './rule-proposed-codec';

// A group exists once an answer joins it. Its open proposed rule is set by the proposal and cleared
// by every way the proposal closes, in the record that closes it. Not now and a lapse set the quiet
// time that the record carries.
export const suggestedRuleGroupsProjection: Projection = {
  table: 'suggested_rule_groups',
  keyColumn: 'group_hash',
  fold: async (tx, record) => {
    const tables = tx.$extendTables<DefinitionsTables>();

    if (record.kind === actionAnsweredCodec.kind) {
      const answered = actionAnsweredCodec.decode(record.payload);

      if (answered.groupHash === undefined) {
        return [];
      }

      await tables
        .insertInto('suggested_rule_groups')
        .values({ group_hash: answered.groupHash })
        .onConflict((conflict) => conflict.doNothing())
        .execute();

      return [answered.groupHash];
    }

    if (record.kind === ruleProposedCodec.kind) {
      const proposed = ruleProposedCodec.decode(record.payload);

      await tables
        .insertInto('suggested_rule_groups')
        .values({ group_hash: proposed.groupHash, proposal_id: proposed.proposalID })
        .onConflict((conflict) =>
          conflict.column('group_hash').doUpdateSet({ proposal_id: proposed.proposalID }),
        )
        .execute();

      return [proposed.groupHash];
    }

    if (record.kind === ruleAnsweredCodec.kind) {
      const answered = ruleAnsweredCodec.decode(record.payload);
      const quiet = answered.quietUntil === undefined ? {} : { quiet_until: answered.quietUntil };

      return closeProposal(tx, answered.proposalID, quiet);
    }

    if (record.kind === ruleLapsedCodec.kind) {
      const lapsed = ruleLapsedCodec.decode(record.payload);

      return closeProposal(tx, lapsed.proposalID, { quiet_until: lapsed.quietUntil });
    }

    // The release before lapses every row of the family with its own record, which carries no quiet
    // time, so the group keeps the lapse time and the check adds the quiet days to it.
    if (record.kind === rulesChangeLapsedCodec.kind) {
      return closeProposal(tx, rulesChangeLapsedCodec.decode(record.payload).proposalID, {
        lapsed_at: record.recordedAt.getTime(),
      });
    }

    // A decline and a lapse start the quiet time from the record's time, as a lapse of the release
    // before does, and the check adds the quiet days to it.
    if (record.kind === proposalsSettledCodec.kind) {
      const settled = proposalsSettledCodec.decode(record.payload);
      const isQuiet = settled.outcome === 'declined' || settled.outcome === 'lapsed';
      const closing = isQuiet ? { lapsed_at: record.recordedAt.getTime() } : {};

      return closeProposal(tx, settled.proposalID, closing);
    }

    if (record.kind === proposalsWithdrawnCodec.kind) {
      return closeProposal(tx, proposalsWithdrawnCodec.decode(record.payload).proposalID, {});
    }

    return [];
  },
};

interface CloseChange {
  readonly quiet_until?: number;
  readonly lapsed_at?: number;
}

async function closeProposal(
  tx: Transaction<unknown>,
  proposalID: string,
  change: CloseChange,
): Promise<readonly string[]> {
  const tables = tx.$extendTables<DefinitionsTables>();

  const group = await tables
    .selectFrom('suggested_rule_groups')
    .select('group_hash')
    .where('proposal_id', '=', proposalID)
    .executeTakeFirst();

  if (group === undefined) {
    return [];
  }

  await tables
    .updateTable('suggested_rule_groups')
    .set({ proposal_id: null, ...change })
    .where('group_hash', '=', group.group_hash)
    .execute();

  return [group.group_hash];
}
