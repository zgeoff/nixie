import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { readDefinitionsInForce } from '../definition/read-definitions-in-force';
import type { SeedResult } from '../rule/run-seed';
import { seedInForceInTransaction } from '../seed/run-in-force-seed';
import type { DefinitionsTables } from '../types';
import { definitionConflictResolvedCodec } from './definition-conflict-resolved-codec';
import type { DefinitionsContext } from './types';

export interface DefinitionResolution {
  readonly definitionID: string;
  readonly keep: 'nixie' | 'repo';
}

export type DefinitionResolutionResult =
  | { readonly status: 'resolved'; readonly changeID: string }
  | { readonly status: 'refused'; readonly code: 'NOT_FOUND'; readonly reason: string };

interface ResolvedChange {
  readonly seed: SeedResult;
  readonly changeID: string;
}

// Ends the conflict of a definition's change in force, then seeds in the same transaction, so a
// `repo` choice has the repo's version in force at the commit.
export async function writeDefinitionResolution(
  context: DefinitionsContext,
  resolution: DefinitionResolution,
): Promise<DefinitionResolutionResult> {
  const result = await withWriteTransaction(
    context.log.writer,
    async (tx): Promise<DefinitionResolutionResult | ResolvedChange> => {
      const inForce = await readDefinitionsInForce(tx);

      if (inForce === null) {
        throw new Error('no definitions are in force yet');
      }

      const change = await tx
        .$extendTables<DefinitionsTables>()
        .selectFrom('runtime_task_definitions')
        .select(['change_id', 'base_hash', 'definitions_hash'])
        .where('definition_id', '=', resolution.definitionID)
        .where('state', '=', 'in_force')
        .executeTakeFirst();

      if (change === undefined || change.base_hash === change.definitions_hash) {
        return {
          status: 'refused',
          code: 'NOT_FOUND',
          reason: `the definition ${resolution.definitionID} has no conflict between nixie's version and the repo's`,
        };
      }

      await writeRecordsInTransaction(tx, context.log, [
        {
          kind: definitionConflictResolvedCodec.kind,
          definitions: {
            snapshotHash: inForce.snapshotHash,
            personaVersion: inForce.personaVersion,
          },
          payload: definitionConflictResolvedCodec.encode({
            changeID: change.change_id,
            definitionID: resolution.definitionID,
            keep: resolution.keep,
            definitions: change.definitions_hash,
          }),
        },
      ]);

      const seed = await seedInForceInTransaction(tx, context.inForceSeed);

      if (seed.status === 'refused') {
        throw seed.error;
      }

      return { seed, changeID: change.change_id };
    },
  );

  if (!('seed' in result)) {
    return result;
  }

  context.onSeeded(result.seed);
  context.wakeExport();

  return { status: 'resolved', changeID: result.changeID };
}
