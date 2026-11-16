import { triggerSchema } from '@heynixie/contract';
import { withWriteTransaction } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import { readDefinitionsInForce } from '../definition/read-definitions-in-force';
import type { SeedResult } from '../rule/run-seed';
import type { DefinitionsTables } from '../types';
import type { DefinitionChangeView } from './pick-definition-move';
import { pickDefinitionMove } from './pick-definition-move';
import { readDefinitionHead } from './read-definition-head';
import { readNamedChange } from './read-named-change';
import { readRepoHash } from './read-repo-hash';
import { readRepoMovedSeedSequence } from './read-repo-moved-seed-sequence';
import type { DefinitionChangeResult, DefinitionsContext } from './types';
import { writeDefinitionChange } from './write-definition-change';

interface WrittenUndo {
  readonly definitionID: string;
  readonly changeID: string;
  readonly shortID: string;
  readonly seed: SeedResult;
  readonly restored: 'repo' | null;
}

// Only the definitions.undo procedure calls it. `changeID` is a change ID or a short ID.
export async function undoDefinitionChange(
  context: DefinitionsContext,
  changeID: string,
): Promise<DefinitionChangeResult> {
  await context.runSeed().catch(() => null);

  const written = await withWriteTransaction(
    context.log.writer,
    async (tx): Promise<DefinitionChangeResult | WrittenUndo> => {
      const inForce = await readDefinitionsInForce(tx);

      if (inForce === null) {
        throw new Error('no definitions are in force yet');
      }

      const named = await readNamedChange(tx, changeID);

      const definitionID = named?.definitionID ?? null;
      const repo = definitionID === null ? null : await readRepoHash(tx, inForce, definitionID);

      const decision = pickDefinitionMove(
        {
          repo,
          head: definitionID === null ? null : await readDefinitionHead(tx, definitionID),
          now: context.log.writer.clock.now(),
          isFileOnly: false,
        },
        {
          kind: 'undo',
          change: named?.change ?? null,
          definitionID,
          restoredOneShotAt: await readRestoredOneShotAt(tx, named?.change ?? null),
          seedSequence:
            named === null
              ? inForce.recordSequence
              : await readRepoMovedSeedSequence(tx, inForce, {
                  changeID: named.change.changeID,
                  hash: repo,
                }),
        },
      );

      if (decision.status === 'refused') {
        return decision;
      }

      const change = await writeDefinitionChange(tx, context, {
        inForce,
        move: decision,
        version: null,
      });

      return { ...change, definitionID: decision.definitionID, restored: decision.restored };
    },
  );

  if (!('seed' in written)) {
    return written;
  }

  context.onSeeded(written.seed);
  context.wakeExport();

  return {
    status: 'changed',
    definitionID: written.definitionID,
    changeID: written.changeID,
    shortID: written.shortID,
    ...(written.restored === null ? {} : { restored: written.restored }),
  };
}

const oneShotFormSchema = z.looseObject({ trigger: triggerSchema.nullish() });

// The time of the one-shot that the earlier version of a change holds, when it is one
async function readRestoredOneShotAt(
  db: Kysely<unknown>,
  change: DefinitionChangeView | null,
): Promise<number | null> {
  if (change?.previous === null || change === null) {
    return null;
  }

  const row = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('task_definition_versions')
    .select('form')
    .where('definition_hash', '=', change.previous)
    .executeTakeFirst();

  if (row === undefined) {
    return null;
  }

  const trigger = oneShotFormSchema.parse(JSON.parse(row.form)).trigger;

  return trigger !== undefined && trigger !== null && 'at' in trigger
    ? Date.parse(trigger.at)
    : null;
}
