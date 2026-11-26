import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export interface MemoryProposalRowSeed {
  readonly proposalID: string;
  readonly itemID: string;
  readonly reviewReason: 'no_quote' | 'self_note';
  readonly subject: 'owner' | 'shared' | 'self' | null;
}

export async function seedMemoryProposalRow(
  db: Kysely<unknown>,
  input: Partial<MemoryProposalRowSeed> = {},
): Promise<MemoryProposalRowSeed> {
  const row = {
    proposalID: crypto.randomUUID(),
    itemID: crypto.randomUUID(),
    reviewReason: 'no_quote' as const,
    subject: 'owner' as const,
    ...input,
  };

  // The db lib sits below every module, so it cannot call the module that writes memory proposals:
  // its storage tests seed the row as the schema shapes it.
  await sql`insert into memory_proposals (proposal_id, item_id, is_new_item, operation, is_pinned,
    review_reason, action_hash, sealed, origin, source, cap_group, created_sequence,
    created_at, subject)
    values (${row.proposalID}, ${row.itemID}, 0, 'remember', 0, ${row.reviewReason},
      ${`sha256:${row.proposalID}`}, 'sealed', 'conversation', 'untrusted', 'group-a', 1,
      1767225600000, ${row.subject})`.execute(db);

  return row;
}
