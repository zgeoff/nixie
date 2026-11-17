import type { Approval, ContentSource, RecordInput } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type { LabelChange, LabelOrigin, Labels, StoreParts } from '../types';
import { itemLabelsCodec } from './item-labels-codec';

export interface LabelWrite {
  readonly itemID: string;
  readonly key: CryptoKey;

  // the item's revision once this record lands
  readonly revision: number;

  // the text version in force, which this record never moves
  readonly version: number;
  readonly change: LabelChange;
  readonly labels: Labels;
  readonly origin: LabelOrigin;
  readonly source: ContentSource;
  readonly taskID: string | null;
  readonly proposalID: string | null;
  readonly model: string | null;
  readonly thread?: string;

  // the notice that the write joins, for a write the user learns of from a notice
  readonly noticeKey?: string;

  readonly approval?: {
    readonly envelope: Approval;
    readonly record: RecordInput;
  };
}

// Every memory.labelled record comes from here, so the in-memory entries never miss one. The
// caller's transaction must hold the delivery lock.
export async function writeLabelsInTransaction(
  parts: Pick<StoreParts, 'context' | 'labels' | 'triggers'>,
  tx: Transaction<unknown>,
  write: LabelWrite,
): Promise<void> {
  const sealed = await itemLabelsCodec.encode(
    write.key,
    { itemID: write.itemID, revision: write.revision },
    write.labels,
  );

  const labelled: RecordInput = {
    kind: 'memory.labelled',
    definitions: parts.context.definitions(),
    ...(write.thread === undefined ? {} : { thread: write.thread }),
    contentSource: write.source,
    ...(write.approval === undefined ? {} : { approval: write.approval.envelope }),
    payload: {
      itemID: write.itemID,
      revision: write.revision,
      version: write.version,
      change: write.change,
      sealed,
      origin: write.origin,
      source: write.source,
      taskID: write.taskID,
      proposalID: write.proposalID,
      model: write.model,
      ...(write.noticeKey === undefined ? {} : { noticeKey: write.noticeKey }),
    },
  };

  await writeRecordsInTransaction(tx, parts.context.log, [
    ...(write.approval === undefined ? [] : [write.approval.record]),
    labelled,
  ]);

  parts.labels.set(write.itemID, write.labels);

  await parts.triggers.set(write.itemID, write.labels.triggers);
}
