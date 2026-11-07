import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { match } from 'ts-pattern';
import type { RuleResolution } from './pick-rule-resolution-move';
import { pickRuleResolutionMove } from './pick-rule-resolution-move';
import { rulesConflictResolvedCodec } from './rules-conflict-resolved-codec';
import type { DefinitionsTables } from './types';
import type { RuleContext } from './write-runtime-rule';
import { writeRuntimeRuleState } from './write-runtime-rule-state';

export type RuleResolutionResult =
  | { readonly status: 'resolved'; readonly changeID: string }
  | { readonly status: 'refused'; readonly code: 'NOT_FOUND'; readonly reason: string };

export async function writeRuleResolution(
  context: RuleContext,
  resolution: RuleResolution,
): Promise<RuleResolutionResult> {
  const result = await withWriteTransaction(
    context.log.writer,
    async (tx): Promise<RuleResolutionResult> => {
      const at = context.clock.now();
      const tables = tx.$extendTables<DefinitionsTables>();

      const change = await tables
        .selectFrom('runtime_rules')
        .select(['change_id', 'base_hash', 'definitions_hash'])
        .where('rule_id', '=', resolution.ruleID)
        .where('state', '=', 'in_force')
        .executeTakeFirst();

      const definitions = await tables
        .selectFrom('definition_rules')
        .select('rule_hash')
        .where('rule_id', '=', resolution.ruleID)
        .executeTakeFirst();

      const move = pickRuleResolutionMove({
        change: change ?? null,
        definitionsHash: definitions?.rule_hash ?? null,
        resolution,
      });

      if (move.status === 'refused') {
        return move;
      }

      await match(move)
        .with({ status: 'keep-nixie' }, (kept) => writeNixieKept(tx, kept.changeID, at))
        .with({ status: 'keep-repo' }, (kept) =>
          writeRepoKept(tx, {
            ruleID: resolution.ruleID,
            changeID: kept.changeID,
            seededHash: kept.seededHash,
            at,
          }),
        )
        .exhaustive();

      await writeRecordsInTransaction(tx, context.log, [
        {
          kind: rulesConflictResolvedCodec.kind,
          definitions: context.definitions(),
          payload: rulesConflictResolvedCodec.encode({
            changeID: move.changeID,
            ruleID: resolution.ruleID,
            keep: resolution.keep,
          }),
        },
      ]);

      return { status: 'resolved', changeID: move.changeID };
    },
  );

  if (result.status === 'resolved') {
    await context.runInForceSeed();
  }

  return result;
}

async function writeNixieKept(tx: Transaction<unknown>, changeID: string, at: number) {
  await tx
    .$extendTables<DefinitionsTables>()
    .updateTable('runtime_rules')
    .set((eb) => ({ base_hash: eb.ref('definitions_hash'), updated_at: at }))
    .where('change_id', '=', changeID)
    .execute();
}

interface RepoKept {
  readonly ruleID: string;
  readonly changeID: string;
  readonly seededHash: string | null;
  readonly at: number;
}

// Keeping the repo's version is your answer to the conflict, so that version applies at once, with
// no widening check, as the version seeded from the definitions.
async function writeRepoKept(tx: Transaction<unknown>, kept: RepoKept) {
  const tables = tx.$extendTables<DefinitionsTables>();

  await writeRuntimeRuleState(tx, { changeID: kept.changeID, to: 'retired', at: kept.at });

  await tables.deleteFrom('seeded_rules').where('rule_id', '=', kept.ruleID).execute();

  if (kept.seededHash !== null) {
    await tables
      .insertInto('seeded_rules')
      .values({ rule_id: kept.ruleID, rule_hash: kept.seededHash })
      .execute();
  }
}
