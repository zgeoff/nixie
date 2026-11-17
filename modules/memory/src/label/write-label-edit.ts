import { withWriteTransaction } from '@heynixie/log';
import { readCurrentItemKey } from '../item-key/read-current-item-key';
import type { VersionExtras } from '../memory/write-memory-version';
import type { Labels, MemoryTables, Provenance, StoreParts, VersionRef } from '../types';
import { MemoryItemNotFoundError } from '../utils/error/memory-item-not-found-error';
import { requireItem } from '../utils/item/require-item';
import { writeLabelsInTransaction } from './write-labels-in-transaction';

export interface LabelEdit {
  // the revision the caller read
  readonly target: VersionRef;
  readonly labels: Labels;
  readonly provenance: Provenance;

  // the notice that the write joins; none for a write that nobody needs a notice of
  readonly noticeKey?: string;
}

export type LabelEditExtras = Pick<
  VersionExtras,
  'requireInTransaction' | 'writeInTransaction' | 'approval'
>;

// A label-only edit writes the labels and no text version.
export function writeLabelEdit(
  parts: StoreParts,
  edit: LabelEdit,
  extras: LabelEditExtras = {},
): Promise<VersionRef> {
  const log = parts.context.log;
  const provenance = edit.provenance;
  const itemID = edit.target.itemID;

  return parts.lock(() =>
    withWriteTransaction(log.writer, async (tx) => {
      const db = tx.$extendTables<MemoryTables>();

      await extras.requireInTransaction?.(tx);
      await extras.writeInTransaction?.(tx);

      const item = await requireItem(db, {
        target: edit.target,
        operation: 'edit',
        states: ['active', 'retired'],
      });

      const current = await readCurrentItemKey(log, itemID, tx);

      if (current.status !== 'readable') {
        throw new MemoryItemNotFoundError(itemID);
      }

      const revision = item.version + item.label_edits + 1;

      await writeLabelsInTransaction(parts, tx, {
        itemID,
        key: current.key,
        revision,
        version: item.version,
        change: 'edited',
        labels: edit.labels,
        origin: provenance.origin,
        source: provenance.source,
        taskID: provenance.taskID,
        proposalID: provenance.proposalID,
        model: provenance.model ?? null,
        ...(provenance.thread === undefined ? {} : { thread: provenance.thread }),
        ...(edit.noticeKey === undefined ? {} : { noticeKey: edit.noticeKey }),
        ...(extras.approval === undefined ? {} : { approval: extras.approval }),
      });

      return { itemID, version: revision };
    }),
  );
}
