import type { Kysely } from 'kysely';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { promptIDs } from './prompt-ids';
import { promptPartFileSchema } from './prompt-proposal-schema';
import { readPromptProposals } from './read-prompt-proposals';
import type { PromptID, PromptPartFile, PromptsTables } from './types';

export interface PromptApproval {
  readonly approvalID: string;
  readonly proposalID: string;
  readonly promptID: PromptID;
  readonly entry: Readonly<Record<string, string>>;
  readonly files: readonly PromptPartFile[];
  readonly reason: string;
}

const promptIDSchema = z.enum(promptIDs);
const entrySchema = z.record(z.string(), z.string());

export async function readPromptApproval(
  db: Kysely<unknown>,
  approvalID: string,
): Promise<PromptApproval> {
  const row = await db
    .$extendTables<PromptsTables>()
    .selectFrom('prompt_approvals')
    .select(['approval_id', 'proposal_id', 'prompt_id', 'entry', 'files'])
    .where('approval_id', '=', approvalID)
    .executeTakeFirstOrThrow();

  const [state] = await readPromptProposals(db, [row.proposal_id]);

  invariant(state, `approval ${approvalID} answers a proposal the log holds`);

  return {
    approvalID: row.approval_id,
    proposalID: row.proposal_id,
    promptID: promptIDSchema.parse(row.prompt_id),
    entry: entrySchema.parse(JSON.parse(row.entry)),
    files: promptPartFileSchema.array().parse(JSON.parse(row.files)),
    reason: state.proposal.reason,
  };
}
