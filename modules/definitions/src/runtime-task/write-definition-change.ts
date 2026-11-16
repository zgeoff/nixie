import { createShortID } from '@heynixie/db';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type { SeedResult } from '../rule/run-seed';
import { seedInForceInTransaction } from '../seed/run-in-force-seed';
import { writeTaskVersions } from '../task/write-task-versions';
import type { DefinitionsInForce } from '../types';
import { definitionChangedCodec } from './definition-changed-codec';
import type { DefinitionMove } from './pick-definition-move';
import type { StoredTaskDefinition } from './stored-task-definition';
import type { DefinitionsContext } from './types';

export interface WrittenDefinitionChange {
  readonly changeID: string;
  readonly shortID: string;
  readonly seed: SeedResult;
}

export interface DefinitionChange {
  readonly inForce: DefinitionsInForce;
  readonly move: DefinitionMove;
  readonly version: StoredTaskDefinition | null;
}

// Steps 4 and 5 of a runtime change, in the caller's transaction: the record, then the seed that
// puts the change in force. A seed that refuses throws, so the whole transaction rolls back and
// leaves no record, no change and no armed trigger.
export async function writeDefinitionChange(
  tx: Transaction<unknown>,
  context: DefinitionsContext,
  change: DefinitionChange,
): Promise<WrittenDefinitionChange> {
  const changeID = crypto.randomUUID();
  const shortID = createShortID();
  const move = change.move;

  if (change.version !== null) {
    await writeTaskVersions(tx, [
      {
        id: change.version.definitionID,
        hash: change.version.hash,
        form: change.version.form,
        files: change.version.files,
      },
    ]);
  }

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: definitionChangedCodec.kind,
      definitions: {
        snapshotHash: change.inForce.snapshotHash,
        personaVersion: change.inForce.personaVersion,
      },
      thread: 'conversation',
      payload: definitionChangedCodec.encode({
        changeID,
        shortID,
        definitionID: move.definitionID,
        operation: move.operation,
        hash: move.hash,
        previous: move.previous,
        caller: move.caller,
        undoes: move.undoes,
        replaces: move.replaces,
        base: move.base,
        definitions: move.definitions,
      }),
      ...(change.version === null
        ? {}
        : {
            erasable: {
              version: {
                definitionID: change.version.definitionID,
                hash: change.version.hash,
                form: change.version.form,
                files: { ...change.version.files },
              },
            },
          }),
    },
  ]);

  const seed = await seedInForceInTransaction(tx, context.inForceSeed);

  if (seed.status === 'refused') {
    throw seed.error;
  }

  return { changeID, shortID, seed };
}
