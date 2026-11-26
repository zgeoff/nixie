import { readMergedProposalIDs } from '@heynixie/memory';
import { readLeftProposalIDs } from '@heynixie/proposals';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';

const taskRowSchema = z.object({ task_id: z.string() });

export interface Proposers {
  // the proposals the caller merged its own proposal into and has not left
  readonly mergedProposalIDs: ReadonlySet<string>;

  // the proposals the caller took its stake back from
  readonly leftProposalIDs: ReadonlySet<string>;

  // the proposals that a task the caller started merged into, on whichever thread they opened
  readonly taskMergedProposalIDs: ReadonlySet<string>;

  // the tasks the caller started itself, open or closed
  readonly startedTaskIDs: ReadonlySet<string>;
}

// The proposals the caller shares as a merged proposer, the proposals its tasks share, and the tasks
// it started, so a list and a withdrawal answer for the caller's own stake only.
export async function readProposers(db: Kysely<unknown>, caller: string): Promise<Proposers> {
  const tasks = await sql`select task_id from tasks where started_by = ${caller}`.execute(db);

  const startedTaskIDs = new Set(tasks.rows.map((row) => taskRowSchema.parse(row).task_id));

  const taskLeft = await readLeftProposalIDs(db, [...startedTaskIDs]);
  const taskMerged = await readMergedProposalIDs(db, [...startedTaskIDs]);

  return {
    startedTaskIDs,
    leftProposalIDs: await readLeftProposalIDs(db, [caller]),
    mergedProposalIDs: await readMergedProposalIDs(db, [caller]),
    taskMergedProposalIDs: new Set([...taskMerged].filter((id) => !taskLeft.has(id))),
  };
}
