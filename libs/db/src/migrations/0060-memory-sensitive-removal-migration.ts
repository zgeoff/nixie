import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { rebuildThreads } from '../database/rebuild-threads';
import { requireNoOrphans } from '../database/require-no-orphans';
import { requireNoProjectionOrphans } from '../database/require-no-projection-orphans';
import { toChunks } from '../database/to-chunks';
import { withTriggersDropped } from '../database/with-triggers-dropped';
import { readQueryRows } from '../read-query-rows';
import type { Migration } from '../types';

// The keys of the deleted records stay in the key store, which a migration cannot reach. A stored
// proposal hash stays as written, because its text and salt are sealed and an approval compares the
// stored string only. The release before writes the dropped columns, so the oldest reader rises.
export const memorySensitiveRemovalMigration: Migration = {
  name: 'drop the sensitive flag of memory items and proposals, and its stored records',
  up: async (tx) => {
    await withTriggersDropped(tx, async () => {
      const marks = await readMarkRecords(tx);
      const calls = await readCalls(tx);
      const results = await readResults(tx, calls);
      const proposals = await readActionProposals(tx, calls);
      const dependents = await readProposalDependents(tx, proposals.ids);

      const removed = [...marks, ...calls, ...results, ...proposals.sequences, ...dependents];

      const forgets = await readForgetRecords(tx, removed);

      const removedSet = new Set([...removed, ...forgets]);

      await requireNoOrphans(tx, removedSet);
      await removeRecords(tx, [...removedSet]);
      await removeProposalRows(tx, proposals.ids);
      await requireNoProjectionOrphans(tx, removedSet);

      if (removedSet.size > 0) {
        await rebuildThreads(tx);
      }

      await rewriteProposedRecords(tx);
      await rewriteReviewReasons(tx);
      await rewriteProjectionChanges(tx);

      await sql`delete from client_actions where procedure = 'memory.markSensitive'`.execute(tx);

      await dropSensitiveColumn(tx, 'memory_items');
      await dropSensitiveColumn(tx, 'memory_proposals');
    });
  },
};

const sequenceSchema = z.object({ sequence: z.number() });

async function readMarkRecords(tx: Transaction<unknown>): Promise<number[]> {
  const rows = await readQueryRows(
    sql`select sequence from records
      where kind in ('memory.sensitive_marked', 'memory.proposal_sensitive_noted')`,
    tx,
    sequenceSchema,
  );

  return rows.map((row) => row.sequence);
}

async function readCalls(tx: Transaction<unknown>): Promise<number[]> {
  const rows = await readQueryRows(
    sql`select sequence from records
      where kind = 'tool_called' and json_extract(payload, '$.tool') = 'memory.mark_sensitive'`,
    tx,
    sequenceSchema,
  );

  return rows.map((row) => row.sequence);
}

async function readResults(tx: Transaction<unknown>, calls: readonly number[]): Promise<number[]> {
  const found: number[] = [];

  for (const chunk of toChunks(calls)) {
    const rows = await readQueryRows(
      sql`select sequence from records
        where kind = 'tool_result' and parent in (${sql.join(chunk)})`,
      tx,
      sequenceSchema,
    );

    found.push(...rows.map((row) => row.sequence));
  }

  return found;
}

async function readActionProposals(
  tx: Transaction<unknown>,
  calls: readonly number[],
): Promise<{ sequences: number[]; ids: string[] }> {
  const sequences: number[] = [];
  const ids: string[] = [];

  for (const chunk of toChunks(calls)) {
    const rows = await readQueryRows(
      sql`select sequence, json_extract(payload, '$.proposalID') as proposal_id from records
        where kind = 'policy.action_proposed'
          and json_extract(payload, '$.callSequence') in (${sql.join(chunk)})`,
      tx,
      z.object({ sequence: z.number(), proposal_id: z.string() }),
    );

    sequences.push(...rows.map((row) => row.sequence));
    ids.push(...rows.map((row) => row.proposal_id));
  }

  return { sequences, ids };
}

// Every record that names the proposal: its answer or lapse, and a defer, return or withdrawal.
async function readProposalDependents(
  tx: Transaction<unknown>,
  proposalIDs: readonly string[],
): Promise<number[]> {
  const found: number[] = [];

  for (const chunk of toChunks(proposalIDs)) {
    const rows = await readQueryRows(
      sql`select sequence from records
        where json_extract(payload, '$.proposalID') in (${sql.join(chunk)})
          or proposal_id in (${sql.join(chunk)})`,
      tx,
      sequenceSchema,
    );

    found.push(...rows.map((row) => row.sequence));
  }

  return found;
}

// A forget of a removed record means nothing once the record is gone.
async function readForgetRecords(
  tx: Transaction<unknown>,
  removed: readonly number[],
): Promise<number[]> {
  const found: number[] = [];

  for (const chunk of toChunks(removed)) {
    const rows = await readQueryRows(
      sql`select sequence from records
        where kind in ('record.forget_started', 'record.forgotten')
          and json_extract(payload, '$.recordSequence') in (${sql.join(chunk)})`,
      tx,
      sequenceSchema,
    );

    found.push(...rows.map((row) => row.sequence));
  }

  return found;
}

async function removeRecords(tx: Transaction<unknown>, removed: readonly number[]): Promise<void> {
  for (const chunk of toChunks(removed)) {
    await sql`delete from record_attachments where sequence in (${sql.join(chunk)})`.execute(tx);
    await sql`delete from projection_changes where sequence in (${sql.join(chunk)})`.execute(tx);
    await sql`delete from records where sequence in (${sql.join(chunk)})`.execute(tx);
  }
}

async function removeProposalRows(
  tx: Transaction<unknown>,
  proposalIDs: readonly string[],
): Promise<void> {
  for (const chunk of toChunks(proposalIDs)) {
    await sql`delete from projection_changes
      where projection = 'proposals' and row_key in (${sql.join(chunk)})`.execute(tx);

    await sql`delete from proposals where proposal_id in (${sql.join(chunk)})`.execute(tx);
  }
}

// A parse with named keys moves them ahead of the others, which would reorder a canonical form.
const recordSchema = z.record(z.string(), z.unknown());

async function rewriteProposedRecords(tx: Transaction<unknown>): Promise<void> {
  const rows = await readQueryRows(
    sql`select sequence, payload from records
      where kind = 'memory.proposed' and json_extract(payload, '$.reviewReason') = 'sensitive'`,
    tx,
    z.object({ sequence: z.number(), payload: z.string() }),
  );

  for (const row of rows) {
    const payload = recordSchema.parse(JSON.parse(row.payload));

    await sql`update records set payload = ${JSON.stringify({ ...payload, reviewReason: 'other' })}
      where sequence = ${row.sequence}`.execute(tx);
  }
}

async function rewriteReviewReasons(tx: Transaction<unknown>): Promise<void> {
  await sql`update memory_proposals set review_reason = 'other'
    where review_reason = 'sensitive'`.execute(tx);

  await sql`update proposals set cause = 'other'
    where family = 'memory' and cause = 'sensitive'`.execute(tx);
}

const changeSchema = z.object({
  sequence: z.number(),
  projection: z.string(),
  row_key: z.string(),
  row: z.string(),
});

async function rewriteProjectionChanges(tx: Transaction<unknown>): Promise<void> {
  const rows = await readQueryRows(
    sql`select sequence, projection, row_key, row from projection_changes
      where projection in ('memory_items', 'memory_proposals', 'proposals') and row is not null`,
    tx,
    changeSchema,
  );

  for (const change of rows) {
    const row = recordSchema.parse(JSON.parse(change.row));
    const next = toRewrittenRow(change.projection, row);
    const text = JSON.stringify(next);

    if (text !== change.row) {
      await sql`update projection_changes set row = ${text}
        where sequence = ${change.sequence} and projection = ${change.projection}
          and row_key = ${change.row_key}`.execute(tx);
    }
  }
}

function toRewrittenRow(
  projection: string,
  row: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([key]) => key !== 'is_sensitive')
      .map(([key, value]) => [key, toRewrittenValue(projection, row, key, value)]),
  );
}

function toRewrittenValue(
  projection: string,
  row: Readonly<Record<string, unknown>>,
  key: string,
  value: unknown,
): unknown {
  const isReviewReason = projection === 'memory_proposals' && key === 'review_reason';
  const isCause = projection === 'proposals' && key === 'cause' && row['family'] === 'memory';

  return (isReviewReason || isCause) && value === 'sensitive' ? 'other' : value;
}

async function dropSensitiveColumn(
  tx: Transaction<unknown>,
  table: 'memory_items' | 'memory_proposals',
): Promise<void> {
  const columns = await sql`
    select name from pragma_table_info(${table}) where name = 'is_sensitive'`.execute(tx);

  if (columns.rows.length > 0) {
    await sql`alter table ${sql.table(table)} drop column is_sensitive`.execute(tx);
  }
}
