import { readItemKeys } from '../item-key/read-item-keys';
import type { MemoryTables, StoreParts } from '../types';
import { decodeProposalText } from '../utils/decode-proposal-text';

export function readRejectedEdits(
  parts: StoreParts,
  proposalIDs: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  if (proposalIDs.length === 0) {
    return Promise.resolve(new Map());
  }

  return parts.lock(async () => {
    const rows = await parts.context.log.writer.db
      .$extendTables<MemoryTables>()
      .selectFrom('memory_proposals')
      .innerJoin('memory_items', 'memory_items.item_id', 'memory_proposals.item_id')
      .select([
        'memory_proposals.proposal_id',
        'memory_proposals.item_id',
        'memory_proposals.sealed',
        'memory_proposals.created_sequence',
      ])
      .where('memory_proposals.proposal_id', 'in', proposalIDs)
      .where('memory_proposals.status', '=', 'rejected')
      .where('memory_proposals.origin', '=', 'conversation')
      .where('memory_proposals.is_new_item', '=', 0)
      .where('memory_items.state', 'in', ['active', 'retired'])
      .execute();

    const keys = await readItemKeys(
      parts.context.log,
      rows.map((row) => ({
        value: 'proposal',
        itemID: row.item_id,
        sequence: row.created_sequence,
      })),
    );

    const readable = rows.flatMap((row, index) => {
      const opened = keys[index];

      return opened?.status === 'readable' ? [{ ...row, key: opened.key }] : [];
    });

    const texts = await Promise.all(
      readable.map(async (row) => {
        try {
          const proposed = await decodeProposalText(row.key, row.proposal_id, row.sealed);

          return [row.proposal_id, proposed.text] as const;
        } catch {
          return null;
        }
      }),
    );

    return new Map(texts.filter((entry) => entry !== null));
  });
}
