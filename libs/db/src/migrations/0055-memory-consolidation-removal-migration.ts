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

// A result of a deleted tool names a change by its UUID, and a migration cannot rewrite a sealed
// result, so each call of the 2 tools goes with its result and its action proposal. The keys of the
// deleted records stay in the key store, which a migration cannot reach.
export const memoryConsolidationRemovalMigration: Migration = {
  name: 'drop the consolidation tables and the stored calls of the memory diff and comment tools',
  up: async (tx) => {
    await sql`delete from projection_changes
      where projection in ('memory_consolidations', 'memory_consolidation_changes')`.execute(tx);

    await sql`drop table if exists memory_consolidation_changes`.execute(tx);
    await sql`drop table if exists memory_consolidations`.execute(tx);

    await withTriggersDropped(tx, async () => {
      const calls = await readCalls(tx);
      const results = await readResults(tx, calls);
      const proposals = await readActionProposals(tx, calls);
      const answers = await readActionAnswers(tx, proposals.ids);

      const removed = [...calls, ...results, ...proposals.sequences, ...answers];

      const forgets = await readForgetRecords(tx, removed);

      const removedSet = new Set([...removed, ...forgets]);

      await requireNoOrphans(tx, removedSet);
      await removeRecords(tx, [...removedSet]);
      await removeProposalRows(tx, proposals.ids);
      await requireNoProjectionOrphans(tx, removedSet);

      if (removedSet.size > 0) {
        await rebuildThreads(tx);
      }
    });
  },
};

const sequenceSchema = z.object({ sequence: z.number() });

async function readCalls(tx: Transaction<unknown>): Promise<number[]> {
  const rows = await readQueryRows(
    sql`select sequence from records
      where kind = 'tool_called'
        and json_extract(payload, '$.tool') in ('memory.diff', 'memory.comment')`,
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

async function readActionAnswers(
  tx: Transaction<unknown>,
  proposalIDs: readonly string[],
): Promise<number[]> {
  const found: number[] = [];

  for (const chunk of toChunks(proposalIDs)) {
    const rows = await readQueryRows(
      sql`select sequence from records
        where kind in ('policy.action_answered', 'policy.action_lapsed')
          and json_extract(payload, '$.proposalID') in (${sql.join(chunk)})`,
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
