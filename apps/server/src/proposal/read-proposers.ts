import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';

const taskRowSchema = z.object({ task_id: z.string() });
const mergeRowSchema = z.object({ proposal_id: z.string() });

export interface Proposers {
  // the proposals the caller merged its own proposal into, which it holds a stake in
  readonly mergedProposalIDs: ReadonlySet<string>;

  // the tasks the caller started itself, open or closed
  readonly startedTaskIDs: ReadonlySet<string>;
}

// The proposals the caller shares as a merged proposer, and the tasks it started, so a list and a
// withdrawal answer for the caller's own stake only.
export async function readProposers(db: Kysely<unknown>, caller: string): Promise<Proposers> {
  const tasks = await sql`select task_id from tasks where started_by = ${caller}`.execute(db);

  const merges = await sql`select distinct proposal_id from memory_proposal_merges
    where thread = ${caller}`.execute(db);

  return {
    startedTaskIDs: new Set(tasks.rows.map((row) => taskRowSchema.parse(row).task_id)),
    mergedProposalIDs: new Set(merges.rows.map((row) => mergeRowSchema.parse(row).proposal_id)),
  };
}
