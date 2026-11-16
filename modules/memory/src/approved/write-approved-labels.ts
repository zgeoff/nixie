import { withWriteTransaction } from '@heynixie/log';
import type { ProposalAnswer } from '../gate/gate-context';
import { readCurrentItemKey } from '../item-key/read-current-item-key';
import { LabelEditError } from '../label/label-edit-error';
import { writeLabelsInTransaction } from '../label/write-labels-in-transaction';
import type { OpenedProposal } from '../proposal/read-open-proposal';
import type { MemoryTables, StoreParts, VersionRef } from '../types';
import { MemoryItemNotFoundError } from '../utils/error/memory-item-not-found-error';
import { requireItem } from '../utils/item/require-item';
import { buildApprovalExtras } from './build-approval-extras';
import { buildApprovedProvenance } from './build-approved-provenance';
import { readApprovalTarget } from './read-approval-target';

// The approval of a label-only proposal writes the reviewed labels and no text version.
export async function writeApprovedLabels(
  parts: StoreParts,
  opened: OpenedProposal,
  answer: ProposalAnswer,
): Promise<VersionRef> {
  const row = opened.row;
  const labels = opened.labels;

  if (answer.editedText !== undefined || labels === null) {
    throw new LabelEditError(row.proposal_id);
  }

  const target = await readApprovalTarget(parts, row);

  const extras = buildApprovalExtras(parts, row, answer);
  const provenance = buildApprovedProvenance(row, false);
  const log = parts.context.log;

  return parts.lock(() =>
    withWriteTransaction(log.writer, async (tx) => {
      const db = tx.$extendTables<MemoryTables>();

      await extras.requireInTransaction?.(tx);
      await answer.writeInTransaction?.(tx);

      const item = await requireItem(db, {
        target,
        operation: 'edit',
        states: ['active', 'retired'],
      });

      const current = await readCurrentItemKey(log, row.item_id, tx);

      if (current.status !== 'readable') {
        throw new MemoryItemNotFoundError(row.item_id);
      }

      const revision = item.version + item.label_edits + 1;

      await writeLabelsInTransaction(parts, tx, {
        itemID: row.item_id,
        key: current.key,
        revision,
        version: item.version,
        change: 'edited',
        labels,
        origin: provenance.origin,
        source: provenance.source,
        taskID: provenance.taskID,
        proposalID: row.proposal_id,
        model: provenance.model ?? null,
        ...(provenance.thread === undefined ? {} : { thread: provenance.thread }),
        ...(extras.approval === undefined ? {} : { approval: extras.approval }),
      });

      return { itemID: row.item_id, version: revision };
    }),
  );
}
