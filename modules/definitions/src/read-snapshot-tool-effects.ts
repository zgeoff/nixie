import { effectNames } from '@heynixie/policy';
import type { Effect } from '@heynixie/policy';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { DefinitionsTables } from './types';

const toolSchema = z.object({ name: z.string(), effects: z.enum(effectNames).array() });
const formSchema = z.object({ policy: z.object({ tools: toolSchema.array() }) });

// The effects each tool held under a snapshot, which a removal of an effect compares against.
export async function readSnapshotToolEffects(
  db: Kysely<unknown>,
  snapshotHash: string,
): Promise<ReadonlyMap<string, readonly Effect[]>> {
  const row = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('definition_snapshots')
    .select('form')
    .where('snapshot_hash', '=', snapshotHash)
    .executeTakeFirst();

  if (row === undefined) {
    return new Map();
  }

  const form = formSchema.parse(JSON.parse(row.form));

  return new Map(form.policy.tools.map((tool) => [tool.name, tool.effects]));
}
