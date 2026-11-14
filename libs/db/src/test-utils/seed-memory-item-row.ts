import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { createShortID } from '../migration/create-short-id';

export interface MemoryItemRowSeed {
  readonly itemID: string;
  readonly shortID: string;
  readonly kind: 'fact' | 'self';
  readonly subject: 'owner' | 'shared' | 'self' | null;
}

export async function seedMemoryItemRow(
  db: Kysely<unknown>,
  input: Partial<MemoryItemRowSeed> = {},
): Promise<MemoryItemRowSeed> {
  const row = {
    itemID: crypto.randomUUID(),
    shortID: createShortID(),
    kind: 'fact' as const,
    subject: 'owner' as const,
    ...input,
  };

  // The db lib sits below every module, so it cannot call the module that writes memory items: its
  // storage tests seed the row as the schema shapes it.
  await sql`insert into memory_items (item_id, version, state, is_pinned, created_sequence,
    updated_sequence, short_id, kind, subject)
    values (${row.itemID}, 1, 'active', 0, 1, 1, ${row.shortID}, ${row.kind}, ${row.subject})`.execute(
    db,
  );

  return row;
}
