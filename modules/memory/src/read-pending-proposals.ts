import { findRecordKeys } from '@heynixie/log';
import { decodeProposalText } from './decode-proposal-text';
import type { MemoryProposal } from './gate-types';
import { parseEvidence } from './parse-evidence';
import type { MemoryTables, StoreParts } from './types';

// Reads the proposals that wait for your answer, oldest first, with their text opened. A proposal
// whose item was forgotten has no key left, so it reads as nothing and drops out of the list.
export async function readPendingProposals(parts: StoreParts): Promise<readonly MemoryProposal[]> {
  const log = parts.context.log;
  const rows = await log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_proposals')
    .selectAll()
    .where('status', '=', 'pending')
    .where('lapse_at', '>', parts.context.gate.clock.now())
    .orderBy('created_sequence')
    .execute();
  const keys = await findRecordKeys(
    log,
    rows.map((row) => row.item_id),
  );
  const proposals = await Promise.all(
    rows.map(async (row) => {
      const key = keys.get(row.item_id);

      if (key === null || key === undefined) {
        return null;
      }
      const text = await decodeProposalText(key, row.proposal_id, row.sealed);

      return {
        proposalID: row.proposal_id,
        operation: row.operation,
        itemID: row.item_id,
        targetVersion: row.target_version,
        isPinned: row.is_pinned === 1,
        reason: row.review_reason,
        actionHash: row.action_hash,
        origin: row.origin,
        source: row.source,
        createdAt: row.created_at,
        lapseAt: row.lapse_at,
        text: text.text,
        quote: text.quote,
        evidence: parseEvidence(row.evidence),
      } satisfies MemoryProposal;
    }),
  );

  return proposals.filter((proposal) => proposal !== null);
}
