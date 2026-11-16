import { triggerSchema } from '@heynixie/contract';
import { withWriteTransaction } from '@heynixie/log';
import type { Kysely, Transaction } from 'kysely';
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

export interface UndoneChange {
  readonly definitionID: string;
  readonly changeID: string;
  readonly restored: 'repo' | null;
}

// What the caller runs inside the undo's own write transaction
export interface UndoHooks<Stop> {
  // runs before the decision; a value that is not null ends the undo with that value and writes
  // nothing, such as the stored result of a client action that already ran
  readonly before: (tx: Transaction<unknown>) => Promise<Stop | null>;

  // runs once the change is written and its seed has run, so what it writes commits with them
  readonly after: (tx: Transaction<unknown>, change: UndoneChange) => Promise<void>;
}

interface WrittenUndo {
  readonly definitionID: string;
  readonly changeID: string;
  readonly shortID: string;
  readonly seed: SeedResult;
  readonly restored: 'repo' | null;
}

type UndoRun<Stop> =
  | { readonly status: 'stopped'; readonly stop: Stop }
  | { readonly status: 'refused'; readonly result: DefinitionChangeResult }
  | ({ readonly status: 'written' } & WrittenUndo);

// Only the definitions.undo procedure calls it. `changeID` is a change ID or a short ID.
export async function undoDefinitionChange<Stop = never>(
  context: DefinitionsContext,
  changeID: string,
  hooks?: UndoHooks<Stop>,
): Promise<DefinitionChangeResult | Stop> {
  await context.runSeed().catch(() => null);

  const run = await withWriteTransaction(context.log.writer, async (tx): Promise<UndoRun<Stop>> => {
    const stop = hooks === undefined ? null : await hooks.before(tx);

    if (stop !== null) {
      return { status: 'stopped', stop };
    }

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
      return { status: 'refused', result: decision };
    }

    const change = await writeDefinitionChange(tx, context, {
      inForce,
      move: decision,
      version: null,
    });

    await hooks?.after(tx, {
      definitionID: decision.definitionID,
      changeID: change.changeID,
      restored: decision.restored,
    });

    return {
      status: 'written',
      ...change,
      definitionID: decision.definitionID,
      restored: decision.restored,
    };
  });

  if (run.status === 'stopped') {
    return run.stop;
  }

  if (run.status === 'refused') {
    return run.result;
  }

  const written = run;

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
