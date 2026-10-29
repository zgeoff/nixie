import { readRecordKeys } from '@heynixie/log';
import { decodeProposalText } from './decode-proposal-text';
import type { MemoryTables, StoreParts } from './types';

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
      ])
      .where('memory_proposals.proposal_id', 'in', proposalIDs)
      .where('memory_proposals.status', '=', 'rejected')
      .where('memory_proposals.origin', '=', 'conversation')
      .where('memory_proposals.is_new_item', '=', 0)
      .where('memory_items.state', 'in', ['active', 'retired'])
      .where('memory_items.is_sensitive', '=', 0)
      .execute();

    const keys = await readRecordKeys(
      parts.context.log,
      rows.map((row) => row.item_id),
    );

    const readable = rows.flatMap((row) => {
      const key = keys.get(row.item_id);

      return key === undefined || key === null ? [] : [{ ...row, key }];
    });

    const texts = await Promise.all(
      readable.map((row) =>
        decodeProposalText(row.key, row.proposal_id, row.sealed).then(
          (proposed) => [row.proposal_id, proposed.text] as const,
          () => null,
        ),
      ),
    );

    return new Map(texts.filter((entry) => entry !== null));
  });
}
