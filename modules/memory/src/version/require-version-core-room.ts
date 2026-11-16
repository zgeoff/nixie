import type { MemoryApproval } from '@heynixie/sessions';
import type { Kysely } from 'kysely';
import { toReviewReason } from '../gate/to-review-reason';
import { readPinnedItems } from '../pinned/read-pinned-items';
import { requirePinnedCoreRoom } from '../pinned/require-pinned-core-room';
import type { MemoryTables, Provenance, StoreParts } from '../types';
import type { CorePin } from '../utils/count-pinned-core-tokens';
import { buildVersionApproval } from './build-version-approval';

export type PendingPin = Omit<CorePin, 'approval'> & Pick<Provenance, 'proposalID'>;

export async function requireVersionCoreRoom(
  parts: StoreParts,
  db: Kysely<unknown>,
  pin: PendingPin,
): Promise<void> {
  const [pinned, approval] = await Promise.all([
    readPinnedItems(parts, db),
    readProposalApproval(db, pin.proposalID),
  ]);

  requirePinnedCoreRoom(parts.context, pinned, { ...pin, approval });
}

async function readProposalApproval(
  db: Kysely<unknown>,
  proposalID: string | null,
): Promise<MemoryApproval | null> {
  if (proposalID === null) {
    return null;
  }

  const proposal = await db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_proposals')
    .select(['operation', 'review_reason as reason'])
    .where('proposal_id', '=', proposalID)
    .executeTakeFirst();

  const approved =
    proposal === undefined
      ? null
      : { operation: proposal.operation, reason: toReviewReason(proposal.reason) };

  return buildVersionApproval(approved);
}
