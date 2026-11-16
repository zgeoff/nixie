import { parseJSONObject } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { DefinitionsInForce } from '../types';
import { definitionRepoMovedCodec } from './definition-repo-moved-codec';

type RecordTables = Readonly<{
  records: { readonly sequence: number; readonly kind: string; readonly payload: string };
}>;

const movedSchema = z.object({ changeID: z.string(), definitions: z.string().nullable() });

export interface FoundRepoVersion {
  readonly changeID: string;
  readonly hash: string | null;
}

// The seed record that found the repo's version `hash` for the change: the one that wrote the
// change's definition.repo_moved. When none did, the repo moved after the change was adopted, so
// the last accepted seed holds the version.
export async function readRepoMovedSeedSequence(
  db: Kysely<unknown>,
  inForce: DefinitionsInForce,
  found: FoundRepoVersion,
): Promise<number> {
  const tables = db.$extendTables<RecordTables>();

  const moves = await tables
    .selectFrom('records')
    .select(['sequence', 'payload'])
    .where('kind', '=', definitionRepoMovedCodec.kind)
    .orderBy('sequence', 'desc')
    .execute();

  const move = moves.find((entry) => {
    const payload = movedSchema.safeParse(parseJSONObject(entry.payload));

    return (
      payload.success &&
      payload.data.changeID === found.changeID &&
      payload.data.definitions === found.hash
    );
  });

  if (move === undefined) {
    return inForce.recordSequence;
  }

  const seed = await tables
    .selectFrom('records')
    .select((eb) => eb.fn.max('sequence').as('sequence'))
    .where('kind', '=', 'definitions_seeded')
    .where('sequence', '<=', move.sequence)
    .executeTakeFirst();

  return seed?.sequence ?? inForce.recordSequence;
}
