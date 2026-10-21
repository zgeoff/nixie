import type { MemoryApproval } from '@heynixie/sessions';
import type { Kysely } from 'kysely';
import { buildVersionApproval } from './build-version-approval';
import type { CorePin } from './count-pinned-core-tokens';
import { readPinnedItems } from './read-pinned-items';
import { requirePinnedCoreRoom } from './require-pinned-core-room';
import { toReviewReason } from './to-review-reason';
import type { MemoryTables, Provenance, StoreParts } from './types';

export type PendingPin = Omit<CorePin, 'approval'> & Pick<Provenance, 'proposalID'>;

export async function requireVersionCoreRoom(
  parts: StoreParts,
  db: Kysely<MemoryTables>,
  pin: PendingPin,
): Promise<void> {
  const [pinned, approval] = await Promise.all([
    readPinnedItems(parts, db),
    readProposalApproval(db, pin.proposalID),
  ]);

  requirePinnedCoreRoom(parts.context, pinned, { ...pin, approval });
}

async function readProposalApproval(
  db: Kysely<MemoryTables>,
  proposalID: string | null,
): Promise<MemoryApproval | null> {
  if (proposalID === null) {
    return null;
  }

  const proposal = await db
    .selectFrom('memory_proposals')
    .select(['operation', 'review_reason as reason'])
    .where('proposal_id', '=', proposalID)
    .executeTakeFirst();

  const approved =
    proposal === undefined
      ? null
      : { operation: proposal.operation, reason: toReviewReason(proposal.reason) };

  return buildVersionApproval(proposalID, approved);
}
