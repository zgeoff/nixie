import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import type { Migration } from '../types';

export const memoryLabelsMigration: Migration = {
  name: 'add the labels and the label edit count of memory items',
  up: async (tx) => {
    await createColumn(tx, {
      table: 'memory_items',
      column: 'label_edits',
      definition: 'integer not null default 0',
    });

    await createColumn(tx, {
      table: 'memory_proposals',
      column: 'sealed_labels',
      definition: 'text',
    });

    await createColumn(tx, {
      table: 'memory_proposals',
      column: 'target_revision',
      definition: 'integer',
    });

    await createColumn(tx, {
      table: 'memory_proposals',
      column: 'is_label_only',
      definition: 'integer not null default 0',
    });

    await sql`create table if not exists memory_labels (
      item_id text not null,
      revision integer not null check (revision >= 1),
      version integer not null check (version >= 1),
      change text not null check (change in ('written', 'edited', 'backfilled')),
      sealed text not null,
      origin text not null check (
        origin in ('owner', 'conversation', 'task', 'memory_writer', 'migration')
      ),
      source text not null check (source in ('owner', 'owner_data', 'untrusted')),
      task_id text,
      proposal_id text,
      model text,
      sequence integer primary key references records (sequence),
      recorded_at integer not null
    ) strict`.execute(tx);

    await sql`create index if not exists memory_labels_by_item
      on memory_labels (item_id, sequence)`.execute(tx);
  },
};

interface ColumnAddition {
  readonly table: 'memory_items' | 'memory_proposals';
  readonly column: string;
  readonly definition: string;
}

async function createColumn(tx: Transaction<unknown>, addition: ColumnAddition): Promise<void> {
  const columns = await sql`
    select name from pragma_table_info(${addition.table})
    where name = ${addition.column}`.execute(tx);

  if (z.object({ name: z.string() }).array().parse(columns.rows).length === 0) {
    await sql`alter table ${sql.table(addition.table)}
      add column ${sql.ref(addition.column)} ${sql.raw(addition.definition)}`.execute(tx);
  }
}
